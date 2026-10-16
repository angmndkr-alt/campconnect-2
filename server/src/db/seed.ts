import { hashPassword } from '../lib/password.js';
import { closePool, one, query, rows } from './pool.js';

/**
 * Idempotent seed — safe to re-run. Creates the club calendars, the platform
 * accounts (super admin, club admins, a demo student and check-in staff), the
 * sample events with ticket types and registration questions, plus content.
 */

const CALENDARS = [
  { id: 'cesa', slug: 'cesa-csi', name: 'CESA & CSI', icon: 'CC', tone: 'mint', members: 512,
    blurb: 'Civil and Computer engineering societies — builds, bytes and beyond.' },
  { id: 'mesa', slug: 'mesa', name: 'MESA', icon: 'M', tone: 'amber', members: 438,
    blurb: 'Mechanical Engineering Students Association — machines, making and motorsports.' },
  { id: 'ecsa', slug: 'ecsa', name: 'ECSA', icon: 'E', tone: 'purple', members: 371,
    blurb: 'Electronics & Communication students exploring circuits, signals and IoT.' },
  { id: 'itsa', slug: 'itsa', name: 'ITSA', icon: 'IT', tone: 'coral', members: 465,
    blurb: 'Information Technology Students Association — code, cloud and community.' },
  { id: 'aiml', slug: 'aiml', name: 'AIML', icon: 'AI', tone: 'mint', members: 524,
    blurb: 'AI & Machine Learning club — models, hackathons and research jams.' },
  { id: 'council', slug: 'students-council', name: 'Students Council', icon: 'SC', tone: 'amber', members: 890,
    blurb: 'The central student body behind every fest, league and campus celebration.' },
];

type SeedUser = {
  email: string;
  fullName: string;
  password: string;
  role: 'student' | 'club_admin' | 'checkin_staff' | 'super_admin';
  department?: string;
  yearOrDesignation?: string;
  calendarIds?: string[];
};

const USERS: SeedUser[] = [
  { email: 'admin@pvppcoe.ac.in', fullName: 'Super Admin', password: 'campus2026', role: 'super_admin',
    department: 'Campus Administration', yearOrDesignation: 'Platform Owner' },
  { email: 'admin.cesa@pvppcoe.ac.in', fullName: 'Ananya Rao', password: 'campus2026', role: 'club_admin',
    department: 'Computer Science', yearOrDesignation: 'Club Secretary', calendarIds: ['cesa'] },
  { email: 'admin.mesa@pvppcoe.ac.in', fullName: 'Arjun Mehta', password: 'campus2026', role: 'club_admin',
    department: 'Mechanical Engineering', yearOrDesignation: 'Club President', calendarIds: ['mesa'] },
  { email: 'admin.ecsa@pvppcoe.ac.in', fullName: 'Naina Bose', password: 'campus2026', role: 'club_admin',
    department: 'Electronics & Communication', yearOrDesignation: 'Club Secretary', calendarIds: ['ecsa'] },
  { email: 'admin.itsa@pvppcoe.ac.in', fullName: 'Kabir Menon', password: 'campus2026', role: 'club_admin',
    department: 'Information Technology', yearOrDesignation: 'Club President', calendarIds: ['itsa'] },
  { email: 'admin.aiml@pvppcoe.ac.in', fullName: 'Ishita Rao', password: 'campus2026', role: 'club_admin',
    department: 'Artificial Intelligence', yearOrDesignation: 'Club Secretary', calendarIds: ['aiml'] },
  { email: 'admin.council@pvppcoe.ac.in', fullName: 'Meera Shah', password: 'campus2026', role: 'club_admin',
    department: 'Student Affairs', yearOrDesignation: 'Council Coordinator', calendarIds: ['council'] },
  { email: 'student@pvppcoe.ac.in', fullName: 'Riya Sharma', password: 'student123', role: 'student',
    department: 'Computer Science', yearOrDesignation: 'Year 3' },
  { email: 'door.staff@pvppcoe.ac.in', fullName: 'Vikram Nair', password: 'campus2026', role: 'checkin_staff',
    department: 'Student Affairs', yearOrDesignation: 'Volunteer', calendarIds: ['council'] },
];

const EVENTS = [
  { id: 'e1000000-0000-4000-8000-000000000001', calendarId: 'council', title: 'Midnight Mosaic',
    slug: 'midnight-mosaic', category: 'Cultural', date: '2026-10-18', time: '18:30',
    venue: 'Open Air Theatre', xp: 80, tone: 'coral', capacity: 400, approval: false,
    description: 'An evening of dance, theatre, music and stories from across campus.',
    cover: '/campconnect/cultural-night.jpg' },
  { id: 'e1000000-0000-4000-8000-000000000002', calendarId: 'aiml', title: 'Build-a-Bot Sprint',
    slug: 'build-a-bot-sprint', category: 'Tech', date: '2026-10-20', time: '10:00',
    venue: 'Innovation Lab', xp: 100, tone: 'mint', capacity: 120, approval: true,
    description: 'Team up, prototype a rover and race through our obstacle course.',
    cover: '/campconnect/robotics-lab.jpg' },
  { id: 'e1000000-0000-4000-8000-000000000003', calendarId: 'council', title: 'Inter-Dept Hoops',
    slug: 'inter-dept-hoops', category: 'Sports', date: '2026-10-22', time: '16:00',
    venue: 'Main Court', xp: 120, tone: 'amber', capacity: 300, approval: false,
    description: 'The annual inter-department basketball league returns under the lights.',
    cover: '/campconnect/sports-cup.jpg' },
  { id: 'e1000000-0000-4000-8000-000000000004', calendarId: 'ecsa', title: 'Twilight Photo Walk',
    slug: 'twilight-photo-walk', category: 'Cultural', date: '2026-10-24', time: '17:15',
    venue: 'Clock Tower', xp: 60, tone: 'purple', capacity: 60, approval: false,
    description: 'A guided golden-hour photo walk ending with a peer critique.',
    cover: '/campconnect/photo-walk.jpg' },
  { id: 'e1000000-0000-4000-8000-000000000005', calendarId: 'cesa', title: 'Open Source Jam',
    slug: 'open-source-jam', category: 'Tech', date: '2026-10-27', time: '11:00',
    venue: 'CS Block 204', xp: 80, tone: 'mint', capacity: 150, approval: false,
    description: 'Make your first contribution with mentors from the developer community.',
    cover: '/campconnect/robotics-lab.jpg' },
  { id: 'e1000000-0000-4000-8000-000000000006', calendarId: 'council', title: 'Campus Cup Finals',
    slug: 'campus-cup-finals', category: 'Sports', date: '2026-10-29', time: '15:30',
    venue: 'University Ground', xp: 100, tone: 'amber', capacity: 500, approval: false,
    description: 'Cheer on the finalists and celebrate the campus champions.',
    cover: '/campconnect/sports-cup.jpg' },
];

const CHANNELS = [
  { id: '11111111-1111-4111-8111-111111111111', slug: 'general', name: 'General', calendarId: null as string | null },
  { id: '22222222-2222-4222-8222-222222222222', slug: 'cesa-csi', name: 'CESA & CSI', calendarId: 'cesa' },
  { id: '33333333-3333-4333-8333-333333333333', slug: 'mesa', name: 'MESA', calendarId: 'mesa' },
  { id: '44444444-4444-4444-8444-444444444444', slug: 'ecsa', name: 'ECSA', calendarId: 'ecsa' },
  { id: '55555555-5555-4555-8555-555555555555', slug: 'itsa', name: 'ITSA', calendarId: 'itsa' },
  { id: '66666666-6666-4666-8666-666666666666', slug: 'aiml', name: 'AIML', calendarId: 'aiml' },
  { id: '77777777-7777-4777-8777-777777777777', slug: 'students-council', name: 'Students Council', calendarId: 'council' },
];

async function seedCalendars(): Promise<void> {
  for (const c of CALENDARS) {
    await query(
      `INSERT INTO calendars (id, slug, name, icon, tone, blurb, members_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, blurb = EXCLUDED.blurb`,
      [c.id, c.slug, c.name, c.icon, c.tone, c.blurb, c.members],
    );
  }
  console.log(`[seed] calendars: ${CALENDARS.length}`);
}

async function seedUsers(): Promise<void> {
  for (const u of USERS) {
    const existing = await one<{ id: string }>(
      'SELECT id FROM profiles WHERE lower(email) = lower($1)',
      [u.email],
    );

    let userId = existing?.id;

    if (!userId) {
      const hash = await hashPassword(u.password);
      // Club admins and door staff must set their own password on first sign-in.
      const mustChange = u.role === 'club_admin' || u.role === 'checkin_staff';
      const created = await one<{ id: string }>(
        `INSERT INTO profiles (email, password_hash, full_name, department,
                               year_or_designation, role, must_change_password)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          u.email,
          hash,
          u.fullName,
          u.department ?? null,
          u.yearOrDesignation ?? null,
          u.role,
          mustChange,
        ],
      );
      userId = created?.id;
    }

    if (!userId) continue;

    for (const calendarId of u.calendarIds ?? []) {
      const role = u.role === 'checkin_staff' ? 'checkin_staff' : u.role === 'super_admin' ? 'owner' : 'admin';
      await query(
        `INSERT INTO calendar_admins (calendar_id, profile_id, role)
         VALUES ($1,$2,$3) ON CONFLICT (calendar_id, profile_id) DO UPDATE SET role = EXCLUDED.role`,
        [calendarId, userId, role],
      );
    }
  }

  const count = await one<{ n: number }>('SELECT count(*)::int AS n FROM profiles');
  console.log(`[seed] profiles: ${count?.n ?? 0}`);
}

async function seedChannels(): Promise<void> {
  for (const ch of CHANNELS) {
    await query(
      `INSERT INTO channels (id, slug, name, calendar_id)
       VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO NOTHING`,
      [ch.id, ch.slug, ch.name, ch.calendarId],
    );
  }
  console.log(`[seed] channels: ${CHANNELS.length}`);
}

async function seedEvents(): Promise<void> {
  for (const e of EVENTS) {
    await query(
      `INSERT INTO events (id, calendar_id, title, slug, category, description, date, time,
                           venue, xp, tone, cover_url, max_capacity, requires_approval, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               (SELECT id FROM profiles WHERE email IN ('admin.council@pvppcoe.ac.in', 'admin.council@campus.edu') LIMIT 1))
       ON CONFLICT (slug) DO NOTHING`,
      [
        e.id,
        e.calendarId,
        e.title,
        e.slug,
        e.category,
        e.description,
        e.date,
        e.time,
        e.venue,
        e.xp,
        e.tone,
        e.cover,
        e.capacity,
        e.approval,
      ],
    );

    await query(
      `INSERT INTO ticket_types (event_id, name, requires_approval, capacity, sort_order)
       SELECT id, $2, $3, $4, 0 FROM events WHERE slug = $1
       ON CONFLICT DO NOTHING`,
      [
        e.slug,
        e.approval ? 'Participant Pass (Approval Required)' : 'Standard',
        e.approval,
        e.capacity,
      ],
    );

    // Ensure the event has at least one ticket type even if the row above
    // matched an existing event.
    const missingTicket = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM ticket_types WHERE event_id =
         (SELECT id FROM events WHERE slug = $1)`,
      [e.slug],
    );
    if ((missingTicket?.n ?? 0) === 0) {
      await query(
        `INSERT INTO ticket_types (event_id, name, requires_approval, capacity, sort_order)
         SELECT id, 'Standard', $2, $3, 0 FROM events WHERE slug = $1`,
        [e.slug, e.approval, e.capacity],
      );
    }
  }

  // Registration questions for the approval-gated event.
  const botEvent = await one<{ id: string }>(
    `SELECT id FROM events WHERE slug = 'build-a-bot-sprint'`,
  );
  if (botEvent) {
    const existingQuestions = await one<{ n: number }>(
      'SELECT count(*)::int AS n FROM registration_questions WHERE event_id = $1',
      [botEvent.id],
    );

    if ((existingQuestions?.n ?? 0) === 0) {
      await query(
        `INSERT INTO registration_questions (event_id, question_text, question_type, required, sort_order)
         VALUES ($1,$2,$3,$4,0), ($1,$5,$6,$7,1)`,
        [
          botEvent.id,
          'What is your primary programming language or hardware focus?',
          'text',
          true,
          'Do you have a pre-formed team of 2-4 members?',
          'text',
          false,
        ],
      );
    }
  }

  const count = await one<{ n: number }>('SELECT count(*)::int AS n FROM events');
  console.log(`[seed] events: ${count?.n ?? 0}`);
}

/** Demo registrations so the guest list and attendance views have data. */
async function seedGuests(): Promise<void> {
  const student = await one<{ id: string }>(
    `SELECT id FROM profiles WHERE email IN ('student@pvppcoe.ac.in', 'student@campus.edu') LIMIT 1`,
  );

  const mosaic = await one<{ id: string }>(
    `SELECT id FROM events WHERE slug = 'midnight-mosaic'`,
  );
  const bot = await one<{ id: string }>(`SELECT id FROM events WHERE slug = 'build-a-bot-sprint'`);
  const photoWalk = await one<{ id: string }>(
    `SELECT id FROM events WHERE slug = 'twilight-photo-walk'`,
  );

  const demoGuests = [
    { event: mosaic, name: 'Riya Sharma', email: 'student@pvppcoe.ac.in', status: 'approved',
      checkedIn: false, profileId: student?.id ?? null, dept: 'Computer Science', year: 'Year 3',
      token: 'demo-qr-riya-mosaic' },
    { event: mosaic, name: 'Dev Patel', email: 'dev.patel@pvppcoe.ac.in', status: 'approved',
      checkedIn: true, profileId: null, dept: 'Civil Engineering', year: 'Year 2',
      token: 'demo-qr-dev-mosaic' },
    { event: mosaic, name: 'Sara Iqbal', email: 'sara.iqbal@pvppcoe.ac.in', status: 'approved',
      checkedIn: false, profileId: null, dept: 'Design', year: 'Year 4',
      token: 'demo-qr-sara-mosaic' },
    { event: mosaic, name: 'Omar Farooq', email: 'omar.farooq@pvppcoe.ac.in', status: 'pending_approval',
      checkedIn: false, profileId: null, dept: 'Mechanical Engineering', year: 'Year 2',
      token: 'demo-qr-omar-mosaic' },
    { event: bot, name: 'Riya Sharma', email: 'student@pvppcoe.ac.in', status: 'pending_approval',
      checkedIn: false, profileId: student?.id ?? null, dept: 'Computer Science', year: 'Year 3',
      token: 'demo-qr-riya-bot' },
    { event: photoWalk, name: 'Aditi Rao', email: 'aditi.rao@pvppcoe.ac.in', status: 'approved',
      checkedIn: false, profileId: null, dept: 'Electronics', year: 'Year 3',
      token: 'demo-qr-aditi-walk' },
  ];

  let created = 0;

  for (const g of demoGuests) {
    if (!g.event) continue;

    const already = await one<{ id: string }>(
      'SELECT id FROM guests WHERE event_id = $1 AND lower(email) = lower($2)',
      [g.event.id, g.email],
    );
    if (already) continue;

    const ticket = await one<{ id: string }>(
      'SELECT id FROM ticket_types WHERE event_id = $1 ORDER BY sort_order, created_at LIMIT 1',
      [g.event.id],
    );

    const guest = await one<{ id: string }>(
      `INSERT INTO guests (event_id, ticket_type_id, profile_id, full_name, email, status,
                           department, year, qr_token, checked_in_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        g.event.id,
        ticket?.id ?? null,
        g.profileId,
        g.name,
        g.email,
        g.status,
        g.dept,
        g.year,
        g.token,
        g.checkedIn ? new Date() : null,
      ],
    );

    if (guest && g.checkedIn) {
      await query(
        `INSERT INTO check_ins (guest_id, event_id, method)
         VALUES ($1, $2, 'manual')`,
        [guest.id, g.event.id],
      );
    }

    created += 1;
  }

  console.log(`[seed] demo registrations: ${created}`);
}

async function seedContent(): Promise<void> {
  const messageCount = await one<{ n: number }>('SELECT count(*)::int AS n FROM messages');
  if ((messageCount?.n ?? 0) === 0) {
    await query(
      `INSERT INTO messages (channel_id, sender_name, sender_initials, sender_tone,
                             is_admin, club_name, text)
       VALUES
        ('11111111-1111-4111-8111-111111111111','Meera','MS','coral',true,'Students Council','The Mosaic rehearsal photos are up! Check out the gallery.'),
        ('11111111-1111-4111-8111-111111111111','Kabir','KM','mint',true,'ITSA','Need one more teammate for the bot sprint. Anyone interested in CAD/3D printing?'),
        ('11111111-1111-4111-8111-111111111111','Ishita','IR','amber',true,'AIML','Hoops fixtures just dropped. Court 2 at 4 PM!'),
        ('66666666-6666-4666-8666-666666666666','Ishita','IR','purple',true,'AIML','Golden hour tomorrow looks perfect for the walk.')`,
    );
  }

  const noticeCount = await one<{ n: number }>('SELECT count(*)::int AS n FROM announcements');
  if ((noticeCount?.n ?? 0) === 0) {
    await query(
      `INSERT INTO announcements (id, title, body, tone, audience)
       VALUES
        ('a1000000-0000-4000-8000-000000000001','Registration confirmed','You are in for Build-a-Bot Sprint.','mint','All students'),
        ('a1000000-0000-4000-8000-000000000002','Venue changed','Midnight Mosaic moved to Open Air Theatre.','coral','All students'),
        ('a1000000-0000-4000-8000-000000000003','You were mentioned','Kabir mentioned you in #aiml.','purple','All students')
       ON CONFLICT (id) DO NOTHING`,
    );
  }

  const albumCount = await one<{ n: number }>('SELECT count(*)::int AS n FROM albums');
  if ((albumCount?.n ?? 0) === 0) {
    const councilAdmin = await one<{ id: string }>(
      `SELECT id FROM profiles WHERE email IN ('admin.council@pvppcoe.ac.in', 'admin.council@campus.edu') LIMIT 1`,
    );
    const albums = [
      { id: 'b1000000-0000-4000-8000-000000000001', calendarId: 'council', title: 'Midnight Mosaic',
        eventName: 'Midnight Mosaic', date: '18 Sep', description: 'The campus after dark.',
        postedBy: 'Meera Shah', cover: '/campconnect/cultural-night.jpg' },
      { id: 'b1000000-0000-4000-8000-000000000002', calendarId: 'aiml', title: 'Maker moments',
        eventName: null, date: '12 Sep', description: 'Inside the innovation lab.',
        postedBy: 'Ishita Rao', cover: '/campconnect/robotics-lab.jpg' },
      { id: 'b1000000-0000-4000-8000-000000000003', calendarId: 'council', title: 'Court side',
        eventName: 'Inter-Dept Hoops', date: '10 Sep', description: 'A day on the main court.',
        postedBy: 'Meera Shah', cover: '/campconnect/sports-cup.jpg' },
      { id: 'b1000000-0000-4000-8000-000000000004', calendarId: 'ecsa', title: 'Golden hour walk',
        eventName: 'Twilight Photo Walk', date: '8 Sep', description: 'A walk through campus light.',
        postedBy: 'Naina Bose', cover: '/campconnect/photo-walk.jpg' },
    ];

    for (const a of albums) {
      const album = await one<{ id: string }>(
        `INSERT INTO albums (id, calendar_id, owner_id, title, event_name, date, description, posted_by, cover_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          a.id,
          a.calendarId,
          councilAdmin?.id ?? null,
          a.title,
          a.eventName,
          a.date,
          a.description,
          a.postedBy,
          a.cover,
        ],
      );
      if (album) {
        await query('INSERT INTO album_photos (album_id, photo_url) VALUES ($1,$2)', [
          album.id,
          a.cover,
        ]);
      }
    }
  }

  console.log('[seed] content (messages, announcements, albums)');
}

async function main(): Promise<void> {
  console.log('[seed] Starting…');
  await seedCalendars();
  await seedUsers();
  await seedChannels();
  await seedEvents();
  await seedGuests();
  await seedContent();
  console.log('[seed] Done.');

  console.log('\n[seed] Demo accounts');
  console.log('  Super admin : admin@pvppcoe.ac.in        / campus2026');
  console.log('  Club admin  : admin.cesa@pvppcoe.ac.in   / campus2026  (password change forced)');
  console.log('  Club admin  : admin.aiml@pvppcoe.ac.in   / campus2026  (password change forced)');
  console.log('  Student     : student@pvppcoe.ac.in      / student123');
  console.log('  Check-in    : door.staff@pvppcoe.ac.in   / campus2026  (password change forced)\n');
}

main()
  .catch((error) => {
    console.error('[seed] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => undefined);
    process.exit(process.exitCode ?? 0);
  });