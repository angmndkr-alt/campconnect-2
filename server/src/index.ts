import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { calendarsRouter } from './routes/calendars.routes.js';
import { contentRouter } from './routes/content.routes.js';
import { eventsRouter } from './routes/events.routes.js';
import { galleryRouter } from './routes/gallery.routes.js';
import { guestsRouter } from './routes/guests.routes.js';

const app = express();

// Needed to read the real client IP when running behind a reverse proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  pinoHttp({
    logger,
    autoLogging: !env.isProd,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }),
);

app.use(
  helmet({
    // Uploaded images are fetched from another origin in dev/preview.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin / curl / native clients (no Origin header).
      if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Attach req.user when a Bearer token is present (never rejects).
app.use(attachUser);

/** Liveness probe. */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'campconnect-api',
    environment: env.NODE_ENV,
    time: new Date().toISOString(),
  });
});

// ---- Routes ----
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/events', guestsRouter);
app.use('/api/calendars', calendarsRouter);
app.use('/api/admin', adminRouter);
app.use('/api', contentRouter);
app.use('/api', galleryRouter);

app.use(notFoundHandler);

// Body-parser and multer errors should surface as 4xx, not 500s.
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  const err = error as { type?: string; code?: string; status?: number; message?: string };

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { message: 'That request body was not valid JSON.', code: 'bad_request' },
    });
    return;
  }

  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: { message: 'That file is larger than 8 MB.', code: 'file_too_large' },
    });
    return;
  }

  next(error);
});

app.use(errorHandler);

const port = env.PORT;
app.listen(port, (err?: unknown) => {
  if (err) {
    logger.fatal({ err, port }, 'Failed to start CampConnect API server');
    process.exit(1);
  }
  logger.info(
    { port, env: env.NODE_ENV, uploads: env.uploadDirAbs },
    'CampConnect API listening',
  );
});

export default app;