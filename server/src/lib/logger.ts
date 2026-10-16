import pino from 'pino';
import { env } from '../env.js';

export const logger = pino({
  level: env.isProd ? 'info' : 'debug',
  redact: ['req.headers.authorization','req.headers.cookie','res.headers["set-cookie"]'],
  transport: env.isProd
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
});

export type Logger = typeof logger;