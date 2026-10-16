import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env } from '../env.js';
import { pool, query } from './pool.js';

const migrationsDir = path.join(env.serverRoot, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((r) => r.filename));
}

export async function dropSchema(): Promise<void> {
  console.log('[migrate] Dropping and recreating schema "public"…');
  await query('DROP SCHEMA IF EXISTS public CASCADE');
  await query('CREATE SCHEMA public');
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.log('[migrate] No migration files found in ' + migrationsDir);
    return;
  }

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] skip  ${file}`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    console.log(`[migrate] apply ${file}`);

    const client = await pool.connect();
    try {
      // Each migration file runs in its own transaction.
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  console.log('[migrate] Done.');
}

async function main(): Promise<void> {
  if (process.argv.includes('--drop')) await dropSchema();
  await runMigrations();
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[migrate] Failed:', error.message);
      process.exit(1);
    });
}