import pg from 'pg';
import { env } from '../env.js';

const { Pool, types } = pg;

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates so the
// API payload matches what the frontend calendar/date helpers expect.
types.setTypeParser(types.builtins.DATE, (value: string) => value);
// BIGINT -> number (counts stay small in this app).
types.setTypeParser(types.builtins.INT8, (value: string) => Number(value));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected idle client error', err);
});

/** Run a parameterised query. Always use $1..$n placeholders — never interpolate. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

/** Convenience: return just the rows. */
export async function rows<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/** Convenience: return the first row or null. */
export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/** Run statements inside a transaction, rolling back on any throw. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export type { pg };