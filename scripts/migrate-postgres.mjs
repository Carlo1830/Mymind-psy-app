import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getPool, closePool, reportError } from './postgres-env.mjs';
export async function migrate(client) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations', 0))");
    await client.query('CREATE SCHEMA IF NOT EXISTS mymind');
    await client.query('CREATE TABLE IF NOT EXISTS mymind.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of readdirSync('supabase/migrations').filter(n => n.endsWith('.sql')).sort()) {
      const sql = readFileSync(`supabase/migrations/${name}`, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query('SELECT checksum FROM mymind.schema_migrations WHERE name = $1', [name]);
      if (previous.rows.length) { if (previous.rows[0].checksum !== checksum) throw Error('Applied migration changed'); continue; }
      await client.query(sql);
      await client.query('INSERT INTO mymind.schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
      console.log('Migration applied:', name);
    }
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK'); throw e; }
}
if (process.argv[1]?.endsWith('migrate-postgres.mjs')) {
  let client;
  try { client = await getPool().connect(); await migrate(client); }
  catch(e) { reportError(e); }
  finally { client?.release(); await closePool(); }
}
