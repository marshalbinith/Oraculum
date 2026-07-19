/**
 * Apply SQL migrations in lexical order. Idempotent (files use IF NOT EXISTS).
 * Run with: npm run migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const dir = join(here, 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const pool = getPool();
  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf8');
    process.stdout.write(`→ applying ${file}\n`);
    await pool.query(sql);
  }
  process.stdout.write(`✅ ${files.length} migration(s) applied\n`);
}

migrate()
  .catch((err) => {
    process.stderr.write(`migration failed: ${String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
