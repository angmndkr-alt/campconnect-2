import { Router } from 'express';
import { z } from 'zod';
import { one, query, rows } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { initialsOf, parseBody, parseParams, parseQuery, uuidParam } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertCalendarRole } from '../middleware/rbac.js';
import { asyncHandler } from '../middleware/error.js';

export const contentRouter = Router();

/** GET /api/channels — chat channels. */
contentRouter.get(
  '/channels',
  asyncHandler(async (_req, res) => {
    const list = await rows(
      `SELECT c.*,
              (SELECT count(*) FROM messages m WHERE m.channel_id = c.id)::int AS message_count
         FROM channels c
        ORDER BY c.calendar_id NULLS FIRST, c.name`,
    );
    res.json({ channels: list });
  }),
);

const channelParam = z.object({ id: uuidParam });

/** GET /api/channels/:id/messages */
contentRouter.get(
  '/channels/:id/messages',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, channelParam);
    const { since } = parseQuery(req, z.object({ since: z.string().optional() }));

    const list = since
      ? await rows(
          `SELECT * FROM messages
            WHERE channel_id = $1 AND created_at > $2
            ORDER BY created_at ASC LIMIT 300`,
          [id, since],
        )
      : await rows(
          'SELECT * FROM messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 200',
          [id],
        );

    res.json({ messages: since ? list : list.reverse() });
  }),
);

const sendSchema = z.object({ text: z.string().trim().min(1, 'Type a message.').max(2000) });

/** POST /api/channels/:id/messages */
contentRouter.post(
  '/channels/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, channelParam);
    const body = parseBody(req, sendSchema);

    const channel = await one<{ calendar_id: string | null; name: string }>(
      'SELECT calendar_id, name FROM channels WHERE id = $1',
      [id],
    );
    if (!channel) throw notFound('That channel does not exist.');

    const profile = await one<{ full_name: string; role: string }>(
      'SELECT full_name, role FROM profiles WHERE id = $1',
      [req.user!.id],
    );

    const isAdmin = profile?.role === 'club_admin' || profile?.role === 'super_admin';

    let clubName: string | null = null;
    if (channel.calendar_id) {
      const calendar = await one<{ name: string }>('SELECT name FROM calendars WHERE id = $1', [
        channel.calendar_id,
      ]);
      clubName = calendar?.name ?? null;
    }

    const name = profile?.full_name ?? req.user!.email;
    const message = await one(
      `INSERT INTO messages (channel_id, sender_id, sender_name, sender_initials,
                             sender_tone, is_admin, club_name, text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        id,
        req.user!.id,
        name,
        initialsOf(name),
        isAdmin ? 'mint' : 'purple',
        isAdmin,
        clubName,
        body.text,
      ],
    );

    res.status(201).json({ message });
  }),
);

/** In-app feed: campus announcements plus guest updates addressed to the caller. */
contentRouter.get('/announcements',asyncHandler(async(req,res)=>{
 const list=await rows(`SELECT a.*,c.name AS club_name,p.full_name AS sender_name FROM announcements a LEFT JOIN calendars c ON c.id=a.calendar_id LEFT JOIN profiles p ON p.id=a.sender_id WHERE a.audience='All students' OR a.calendar_id IS NULL OR a.sender_id=$1 OR EXISTS(SELECT 1 FROM follows f WHERE f.calendar_id=a.calendar_id AND f.profile_id=$1) ORDER BY a.created_at DESC LIMIT 100`,[req.user?.id||null]);
 const guestUpdates=req.user?await rows(`SELECT b.id,b.subject AS title,b.message_body AS body,b.sent_at AS created_at,'mint' AS tone,'All students' AS audience,c.name AS club_name,p.full_name AS sender_name,b.sender_id FROM blasts b LEFT JOIN calendars c ON c.id=b.calendar_id LEFT JOIN profiles p ON p.id=b.sender_id WHERE EXISTS (SELECT 1 FROM guests g WHERE g.event_id=b.event_id AND g.is_invalidated=false AND (g.profile_id=$1 OR lower(g.email)=lower($2)) AND ((b.audience='all' AND g.status IN ('approved','pending_approval','invited','waitlist')) OR (b.audience='attendees' AND g.status='approved') OR (b.audience='waitlist' AND g.status='waitlist') OR (b.audience='not_going' AND g.status='declined')))`,[req.user.id,req.user.email]):[];
 res.json({announcements:[...list,...guestUpdates].sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())});
}));

function formatActivityMessage(item: {
  action: string;
  details: string | null;
  actor_name: string | null;
  club_name: string | null;
}): string {
  const actor = item.actor_name || 'Guest';
  const target = item.details || 'an event';
  switch (item.action) {
    case 'guest_registered':
      return `${actor} registered for ${target}.`;
    case 'event_created':
      return `${actor} created ${target}.`;
    case 'event_updated':
      return `${actor} updated ${target}.`;
    case 'event_deleted':
      return `${actor} deleted ${target}.`;
    default:
      return `${actor} performed ${item.action} on ${target}.`;
  }
}

/** GET /api/activity — recent audit trail for the admin dashboard. */
contentRouter.get(
  '/activity',
  requireAuth,
  requireRole('club_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const { calendarId } = parseQuery(req, z.object({ calendarId: z.string().optional() }));
    const isSuper = req.user!.role === 'super_admin';
    const userId = req.user!.id;

    if (calendarId) {
      await assertCalendarRole(req, calendarId, 'admin');
    }

    const querySql = calendarId
      ? `SELECT a.*, c.name AS club_name, p.full_name AS actor_name
           FROM activity_log a
           LEFT JOIN calendars c ON c.id = a.calendar_id
           LEFT JOIN profiles p ON p.id = a.user_id
          WHERE a.calendar_id = $1
          ORDER BY a.created_at DESC LIMIT 20`
      : isSuper
      ? `SELECT a.*, c.name AS club_name, p.full_name AS actor_name
           FROM activity_log a
           LEFT JOIN calendars c ON c.id = a.calendar_id
           LEFT JOIN profiles p ON p.id = a.user_id
          ORDER BY a.created_at DESC LIMIT 20`
      : `SELECT a.*, c.name AS club_name, p.full_name AS actor_name
           FROM activity_log a
           LEFT JOIN calendars c ON c.id = a.calendar_id
           LEFT JOIN profiles p ON p.id = a.user_id
          WHERE a.calendar_id IN (
            SELECT ca.calendar_id FROM calendar_admins ca WHERE ca.profile_id = $1
          )
          ORDER BY a.created_at DESC LIMIT 20`;

    const rawList = calendarId
      ? await rows(querySql, [calendarId])
      : isSuper
      ? await rows(querySql)
      : await rows(querySql, [userId]);

    const list = rawList.map((item: any) => ({
      ...item,
      message: formatActivityMessage(item),
    }));

    res.json({ activity: list });
  }),
);

/** GET /api/leaderboard — clubs ranked by members. */
contentRouter.get(
  '/leaderboard',
  asyncHandler(async (_req, res) => {
    const list = await rows(
      `SELECT c.id, c.slug, c.name, c.icon, c.tone, c.members_count,
              (SELECT count(*) FROM events e WHERE e.calendar_id = c.id)::int AS event_count,
              (SELECT count(*) FROM guests g
                 JOIN events e2 ON e2.id = g.event_id
                WHERE e2.calendar_id = c.id AND g.status = 'approved')::int AS attendee_count
         FROM calendars c
        ORDER BY c.members_count DESC
        LIMIT 20`,
    );
    res.json({ leaderboard: list });
  }),
);

/**
 * GET /api/dashboard — admin workspace rollup.
 * Returns the caller's clubs with headline numbers, mirroring the old
 * localStorage store's `AdminDashboard` stats.
 */
contentRouter.get(
  '/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const isSuper = req.user!.role === 'super_admin';

    const clubs = await rows<{ id: string; name: string; icon: string; tone: string; blurb: string | null }>(
      isSuper
        ? 'SELECT id, name, icon, tone, blurb FROM calendars ORDER BY name'
        : `SELECT c.id, c.name, c.icon, c.tone, c.blurb
             FROM calendars c
             JOIN calendar_admins ca ON ca.calendar_id = c.id
            WHERE ca.profile_id = $1
            ORDER BY c.name`,
      isSuper ? [] : [userId],
    );

    const today = await one<{ upcoming: number }>(
      `SELECT count(*)::int AS upcoming FROM events
        WHERE date >= CURRENT_DATE AND is_published = true`,
    );

    const totals = await one<{ total_events: number; total_registrations: number; total_checked_in: number }>(
      `SELECT
         (SELECT count(*) FROM events)::int                       AS total_events,
         (SELECT count(*) FROM guests WHERE status = 'approved')::int AS total_registrations,
         (SELECT count(*) FROM check_ins)::int                    AS total_checked_in`,
    );

    const activityQuery = isSuper
      ? `SELECT a.*, c.name AS club_name, p.full_name AS actor_name
           FROM activity_log a
           LEFT JOIN calendars c ON c.id = a.calendar_id
           LEFT JOIN profiles p ON p.id = a.user_id
          ORDER BY a.created_at DESC
          LIMIT 8`
      : `SELECT a.*, c.name AS club_name, p.full_name AS actor_name
           FROM activity_log a
           LEFT JOIN calendars c ON c.id = a.calendar_id
           LEFT JOIN profiles p ON p.id = a.user_id
          WHERE a.calendar_id IN (
            SELECT ca.calendar_id FROM calendar_admins ca WHERE ca.profile_id = $1
          )
          ORDER BY a.created_at DESC
          LIMIT 8`;

    const rawActivity = await rows(activityQuery, isSuper ? [] : [userId]);
    const activity = rawActivity.map((item: any) => ({
      ...item,
      message: formatActivityMessage(item),
    }));

    const perClub = await Promise.all(
      clubs.map(async (club) => {
        const [eventCount, registrationStats, recentEvents] = await Promise.all([
          one<{ n: number }>('SELECT count(*)::int AS n FROM events WHERE calendar_id = $1', [
            club.id,
          ]),
          one<{ registrations: number; checked_in: number }>(
            `SELECT
               (SELECT count(*) FROM guests g
                  JOIN events e ON e.id = g.event_id
                 WHERE e.calendar_id = $1 AND g.status = 'approved')::int AS registrations,
               (SELECT count(*) FROM check_ins ci
                  JOIN events e2 ON e2.id = ci.event_id
                 WHERE e2.calendar_id = $1)::int AS checked_in`,
            [club.id],
          ),
          rows(
            `SELECT id, title, slug, date, time, venue, tone, cover_url, max_capacity
               FROM events
              WHERE calendar_id = $1 AND date >= CURRENT_DATE
              ORDER BY date ASC
              LIMIT 3`,
            [club.id],
          ),
        ]);

        return {
          ...club,
          eventCount: eventCount?.n ?? 0,
          registrations: registrationStats?.registrations ?? 0,
          checkedIn: registrationStats?.checked_in ?? 0,
          recentEvents,
        };
      }),
    );

    res.json({
      clubs: perClub,
      totals: {
        events: totals?.total_events ?? 0,
        registrations: totals?.total_registrations ?? 0,
        checkedIn: totals?.total_checked_in ?? 0,
        upcoming: today?.upcoming ?? 0,
      },
      activity,
    });
  }),
);
/** Real participation totals, earned on check-in. */
contentRouter.get('/student-stats',requireAuth,asyncHandler(async(req,res)=>{
 const stats=await one(`SELECT count(*)::int AS attended,COALESCE(sum(e.xp),0)::int AS xp FROM guests g JOIN events e ON e.id=g.event_id WHERE g.profile_id=$1 AND g.checked_in_at IS NOT NULL AND g.is_invalidated=false`,[req.user!.id]);
 const attended=await rows<{event_id:string}>(`SELECT g.event_id FROM guests g WHERE g.profile_id=$1 AND g.checked_in_at IS NOT NULL AND g.is_invalidated=false`,[req.user!.id]);
 res.json({stats,attendedEventIds:attended.map(r=>r.event_id)});
}));
contentRouter.get('/students/leaderboard',asyncHandler(async(_req,res)=>{
 const list=await rows(`SELECT p.id,p.full_name,p.department,count(g.id)::int AS attended,COALESCE(sum(e.xp),0)::int AS xp FROM profiles p LEFT JOIN guests g ON g.profile_id=p.id AND g.checked_in_at IS NOT NULL AND g.is_invalidated=false LEFT JOIN events e ON e.id=g.event_id WHERE p.role='student' GROUP BY p.id ORDER BY xp DESC,p.full_name LIMIT 100`);res.json({leaderboard:list});
}));
contentRouter.get('/sports/teams',requireAuth,asyncHandler(async(req,res)=>{res.json({teams:await rows('SELECT * FROM sports_teams WHERE captain_id=$1 ORDER BY created_at DESC',[req.user!.id])});}));
contentRouter.post('/sports/teams',requireAuth,asyncHandler(async(req,res)=>{
 const b=parseBody(req,z.object({eventId:uuidParam,name:z.string().trim().min(2).max(100),players:z.array(z.string().trim().min(2).max(120)).min(1).max(8)}));
 const e=await one<{category:string}>('SELECT category FROM events WHERE id=$1',[b.eventId]);if(!e||e.category!=='Sports')throw notFound('Select a sports event.');
 const team=await one('INSERT INTO sports_teams(event_id,captain_id,name,players) VALUES($1,$2,$3,$4) ON CONFLICT(event_id,captain_id) DO UPDATE SET name=EXCLUDED.name,players=EXCLUDED.players RETURNING *',[b.eventId,req.user!.id,b.name,JSON.stringify(b.players)]);res.status(201).json({team});
}));
