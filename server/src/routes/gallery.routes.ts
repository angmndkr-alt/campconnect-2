import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../env.js';
import { one, query, rows, tx } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseBody, parseParams, uuidParam } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertCalendarRole, assertEventAccess } from '../middleware/rbac.js';
import { asyncHandler } from '../middleware/error.js';

export const galleryRouter = Router();

// ---- Local file storage (swap for S3/Supabase Storage in production) ----
fs.mkdirSync(env.uploadDirAbs, { recursive: true });

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, env.uploadDirAbs),
    filename: (_req, file, cb) => {
      const ext = ALLOWED_TYPES[file.mimetype] ?? 'bin';
      cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES[file.mimetype]) {
      cb(badRequest('Only image files are allowed.'));
      return;
    }
    cb(null, true);
  },
});

// ---- Static files (serve uploaded images) ----
galleryRouter.use('/files', express.static(env.uploadDirAbs, { maxAge: '7d', fallthrough: true }));

/** POST /api/uploads — multipart form upload (`file` field). */
galleryRouter.post(
  '/uploads',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('No file was uploaded.');

    res.status(201).json({
      url: `/api/files/${file.filename}`,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
    });
  }),
);

const albumSchema = z.object({
  title: z.string().trim().min(2, 'Give the album a title.').max(160),
  eventName: z.string().trim().max(160).nullable().optional(),
  date: z.string().trim().max(40),
  description: z.string().trim().max(1000).nullable().optional(),
  calendarId: z.string().optional(),
  coverUrl: z.string().trim().max(500).default(''),
  photoUrls: z.array(z.string().trim().max(500)).max(60).default([]),
});

/** GET /api/gallery — albums with their photos. */
galleryRouter.get(
  '/gallery',
  asyncHandler(async (_req, res) => {
    const albums = await rows(
      `SELECT a.*, c.name AS club_name, c.tone AS club_tone,
              COALESCE(
                (SELECT json_agg(json_build_object('id', p.id, 'photo_url', p.photo_url)
                                 ORDER BY p.created_at)
                   FROM album_photos p WHERE p.album_id = a.id),
                '[]'::json
              ) AS photos
         FROM albums a
         LEFT JOIN calendars c ON c.id = a.calendar_id
        ORDER BY a.created_at DESC`,
    );
    res.json({ albums });
  }),
);

/** POST /api/gallery — create an album. */
galleryRouter.post(
  '/gallery',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, albumSchema);

    if (body.calendarId) await assertCalendarRole(req, body.calendarId, 'admin');

    const profile = await one<{ full_name: string }>(
      'SELECT full_name FROM profiles WHERE id = $1',
      [req.user!.id],
    );

    const album = await one(
      `INSERT INTO albums (calendar_id, owner_id, title, event_name, date, description,
                           posted_by, cover_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        body.calendarId ?? null,
        req.user!.id,
        body.title,
        body.eventName ?? null,
        body.date,
        body.description ?? null,
        profile?.full_name ?? req.user!.email,
        body.photoUrls[0] ?? body.coverUrl,
      ],
    );

    if (!album) throw new Error('Failed to create album.');

    for (const url of body.photoUrls) {
      await query('INSERT INTO album_photos (album_id, photo_url) VALUES ($1, $2)', [
        (album as { id: string }).id,
        url,
      ]);
    }

    res.status(201).json({ album });
  }),
);

const albumParam = z.object({ id: uuidParam });

/** DELETE /api/gallery/:id */
galleryRouter.delete(
  '/gallery/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, albumParam);
    const album = await one<{ calendar_id: string | null; owner_id: string | null }>(
      'SELECT calendar_id, owner_id FROM albums WHERE id = $1',
      [id],
    );
    if (!album) throw notFound('That album does not exist.');

    const isOwner = album.owner_id === req.user!.id;
    if (album.calendar_id) {
      const canManage = await assertCalendarRole(req, album.calendar_id, 'admin').then(
        () => true,
        () => false,
      );
      if (!canManage && !isOwner) throw notFound('That album does not exist.');
    } else if (!isOwner && req.user!.role !== 'super_admin') {
      throw notFound('That album does not exist.');
    }

    await query('DELETE FROM albums WHERE id = $1', [id]);
    res.json({ ok: true });
  }),
);
/** Update albums and covers; edits are restricted to the owner or club managers. */
galleryRouter.patch('/gallery/:id',requireAuth,asyncHandler(async(req,res)=>{
 const {id}=parseParams(req,albumParam);const body=parseBody(req,albumSchema.partial());
 const a=await one<{owner_id:string;calendar_id:string}>('SELECT owner_id,calendar_id FROM albums WHERE id=$1',[id]);if(!a)throw notFound('Album not found.');
 if(a.owner_id!==req.user!.id&&req.user!.role!=='super_admin'){if(!a.calendar_id)throw notFound('Album not found.');await assertCalendarRole(req,a.calendar_id,'admin');}
 await tx(async c=>{await c.query('UPDATE albums SET title=COALESCE($2,title),event_name=COALESCE($3,event_name),date=COALESCE($4,date),description=COALESCE($5,description),cover_url=COALESCE($6,cover_url) WHERE id=$1',[id,body.title,body.eventName,body.date,body.description,body.coverUrl]);if(body.photoUrls){await c.query('DELETE FROM album_photos WHERE album_id=$1',[id]);for(const url of body.photoUrls)await c.query('INSERT INTO album_photos(album_id,photo_url) VALUES($1,$2)',[id,url]);}});
 res.json({ok:true});
}));
