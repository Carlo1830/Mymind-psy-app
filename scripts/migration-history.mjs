import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function migrationFiles() {
  return readdirSync('supabase/migrations').filter(n => n.endsWith('.sql')).sort().map(name => {
    const sql = readFileSync(`supabase/migrations/${name}`, 'utf8');
    const match = /^(\d+)_(.+)\.sql$/.exec(name);
    if (!match) throw Error(`Invalid migration filename: ${name}`);
    return { name, sql, version: match[1], label: match[2], checksum: createHash('sha256').update(sql).digest('hex') };
  });
}

// Ignore formatting/comments between tokens, but preserve quoted values and function bodies.
export function canonicalSql(sql) {
  sql=sql.replaceAll('\r\n','\n');
  const tokens = sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$[\s\S]*?\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9]*|[^\s;]/g) || [];
  return tokens.filter(t => !t.startsWith('--') && !t.startsWith('/*')).join('\u001f');
}

export async function historyTables(client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS mymind');
  await client.query('CREATE TABLE IF NOT EXISTS mymind.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  await client.query('ALTER TABLE mymind.schema_migrations ENABLE ROW LEVEL SECURITY');
  await client.query('REVOKE ALL ON mymind.schema_migrations FROM PUBLIC');
  await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
  await client.query('CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text)');
}

// These two legacy signatures were recorded by the first production setup.
// They may be replaced only by explicit reconciliation after SQL + catalog validation.
export const legacyChecksums = {
  '202609240001_initial.sql':'5a1e84117420d734c196e13b6ba19695cfdba961f2a87a9615b3500167d2b29e',
  '202609250001_patient_archive.sql':'c21d83bcaa4601a548f8459e8ce1bb873dcb73848ac6cdaa5ba823523a83a90c',
};
export async function readHistory(client, files, {repairChecksums=false}={}) {
  const app = new Map((await client.query('SELECT name,checksum FROM mymind.schema_migrations')).rows.map(r => [r.name,r]));
  const cli = new Map((await client.query('SELECT version,name,statements FROM supabase_migrations.schema_migrations')).rows.map(r => [r.version,r]));
  for (const name of app.keys()) if (!files.some(f => f.name === name)) throw Error(`Repository is missing applied migration: ${name}`);
  for (const version of cli.keys()) if (!files.some(f => f.version === version)) throw Error(`Repository is missing Supabase migration: ${version}`);
  for (const f of files) {
    if (app.has(f.name) && app.get(f.name).checksum !== f.checksum && !(repairChecksums && app.get(f.name).checksum===legacyChecksums[f.name] && cli.has(f.version))) throw Error(`Applied migration changed: ${f.name}`);
    if (cli.has(f.version)) {
      const row = cli.get(f.version);
      if (row.name !== f.label || !row.statements?.length || canonicalSql(row.statements.join(';\n')) !== canonicalSql(f.sql)) throw Error(`Supabase SQL differs: ${f.name}`);
    }
  }
  return {app,cli};
}

export async function recordSupabase(client, file) {
  await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3) ON CONFLICT(version) DO NOTHING', [file.version,file.label,[file.sql]]);
}
