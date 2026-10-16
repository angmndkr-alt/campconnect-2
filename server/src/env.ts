import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Resolve server/.env regardless of the process working directory.
const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
config({ path: path.join(serverRoot, '.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  UPLOAD_DIR: z.string().default('uploads'),
  PUBLIC_URL: z.string().default('http://localhost:4000'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error('[env] Invalid environment configuration:\n' + issues.join('\n'));
  console.error('[env] Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  serverRoot,
  isProd: parsed.data.NODE_ENV === 'production',
  corsOrigins: parsed.data.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDirAbs: path.isAbsolute(parsed.data.UPLOAD_DIR)
    ? parsed.data.UPLOAD_DIR
    : path.join(serverRoot, parsed.data.UPLOAD_DIR),
};

export type Env = typeof env;