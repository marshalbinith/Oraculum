/**
 * PostgreSQL connection pool singleton + small query helpers.
 */
import pg from 'pg';
import { getEnv } from '../config/env.js';

const { Pool } = pg;

// NUMERIC(38,0) columns arrive as strings; keep them as strings (we use bigint
// in app code) rather than letting pg coerce to lossy JS numbers.
pg.types.setTypeParser(1700, (v) => v); // numeric
pg.types.setTypeParser(20, (v) => v); // int8/bigint

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getEnv().DATABASE_URL, max: 10 });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** Run `fn` inside a transaction, rolling back on error. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
