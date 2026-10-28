import { migrationFiles, historyTables, readHistory, recordSupabase } from './migration-history.mjs';
import { getPool, closePool, reportError } from './postgres-env.mjs';
export async function migrate(client) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations', 0))");
    await historyTables(client);
    const files = migrationFiles();
    const {app,cli} = await readHistory(client,files);
    for (const f of files) if (!app.has(f.name) && cli.has(f.version)) throw Error(`Reconcile history first: npm run db:reconcile -- --apply (${f.name})`);
    for (const file of files) {
      const {name,sql,checksum} = file;
      if (app.has(name)) { await recordSupabase(client,file); continue; }
      await client.query(sql);
      await client.query('INSERT INTO mymind.schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
      await recordSupabase(client,file);
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
