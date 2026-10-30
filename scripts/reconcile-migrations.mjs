import { PGlite } from '@electric-sql/pglite';
import { migrationFiles, historyTables, readHistory, recordSupabase } from './migration-history.mjs';
import { getPool, closePool } from './postgres-env.mjs';

// Metadata only. Constraint names may differ after a manual repair; definitions may not.
export const catalogSql = `
SELECT 'column:'||c.relname||'.'||a.attname AS key,
 jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))::text AS value
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='mymind' AND c.relkind='r' AND c.relname<>'schema_migrations'
UNION ALL
 SELECT 'constraint:'||c.relname||':'||pg_get_constraintdef(k.oid), 'present'
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='mymind' AND c.relname<>'schema_migrations' AND k.contype<>'n'
UNION ALL
 SELECT 'table:'||c.relname, jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity)::text
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='mymind' AND c.relkind='r' AND c.relname<>'schema_migrations'
UNION ALL
 SELECT 'function:'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='mymind'
UNION ALL
 SELECT 'trigger:'||c.relname||'.'||t.tgname, pg_get_triggerdef(t.oid)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='mymind' AND NOT t.tgisinternal
UNION ALL
 SELECT 'index:'||i.indexname, i.indexdef FROM pg_indexes i
 WHERE i.schemaname='mymind' AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=(quote_ident(i.schemaname)||'.'||quote_ident(i.indexname))::regclass)
`;

export async function referenceContracts(files=migrationFiles()) {
  const db=await PGlite.create(); const contracts=new Map(); let previous=new Map();
  try {
    await db.exec('CREATE SCHEMA mymind;');
    for (const file of files) {
      await db.exec('BEGIN;');
      await db.exec(file.sql);
      await db.exec('SET LOCAL search_path=pg_catalog;');
      const current=new Map((await db.query(catalogSql)).rows.map(r=>[r.key,r.value]));
      contracts.set(file.name,[...current].filter(([key,value])=>previous.get(key)!==value).concat([...previous.keys()].filter(key=>!current.has(key)).map(key=>[key,null])));
      previous=current; await db.exec('COMMIT;');
    }
    return contracts;
  } finally { await db.close(); }
}

export async function reconcile(client,{apply=false,repairChecksums=false,files=migrationFiles(),contracts}={}) {
  contracts ||= await referenceContracts(files);
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0))");
    await client.query('SET LOCAL search_path=pg_catalog');
    await historyTables(client);
    const {app,cli}=await readHistory(client,files,{repairChecksums});
    const actual=new Map((await client.query(catalogSql)).rows.map(r=>[r.key,r.value]));
    const adopting=files.filter(f=>!app.has(f.name)&&cli.has(f.version));
    const repairing=files.filter(f=>app.has(f.name)&&app.get(f.name).checksum!==f.checksum);
    // Later migrations may supersede an earlier column/default/function definition.
    const latest=new Map();
    for (const f of files) if(app.has(f.name)||cli.has(f.version)) for(const pair of contracts.get(f.name)) latest.set(...pair);
    for(const f of [...adopting,...repairing]) for(const [key] of contracts.get(f.name)) {
      if((actual.get(key)??null)!==latest.get(key)) throw Error(`Schema differs for ${f.name}: ${key.split(':').slice(0,2).join(':')}`);
    }
    const policies=await client.query("SELECT tablename FROM pg_policies WHERE schemaname='mymind' AND tablename IN ('agenda_emails','evaluaciones_clinicas')");
    if(policies.rows.length) throw Error('Unexpected public-access policy on a private application table');
    if(apply && repairing.length) {
      await client.query('CREATE TABLE IF NOT EXISTS mymind.migration_reconciliation_audit (name text NOT NULL, old_checksum text NOT NULL, new_checksum text NOT NULL, verified_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(name,old_checksum,new_checksum))');
      await client.query('ALTER TABLE mymind.migration_reconciliation_audit ENABLE ROW LEVEL SECURITY');
      await client.query('REVOKE ALL ON mymind.migration_reconciliation_audit FROM PUBLIC');
      for(const f of repairing) {
        await client.query('INSERT INTO mymind.migration_reconciliation_audit(name,old_checksum,new_checksum) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[f.name,app.get(f.name).checksum,f.checksum]);
        await client.query('UPDATE mymind.schema_migrations SET checksum=$2 WHERE name=$1',[f.name,f.checksum]);
      }
    }
    for(const f of adopting) {
      if(apply) await client.query('INSERT INTO mymind.schema_migrations(name,checksum) VALUES($1,$2)',[f.name,f.checksum]);
    }
    // Backfill the CLI ledger from verified app history, without rerunning DDL.
    if(apply) for(const f of files) if(app.has(f.name)&&!cli.has(f.version)) await recordSupabase(client,f);
    await client.query(apply?'COMMIT':'ROLLBACK');
    return {apply,adopted:adopting.map(f=>f.name),repaired:repairing.map(f=>f.name),pending:files.filter(f=>!app.has(f.name)&&!cli.has(f.version)).map(f=>f.name)};
  } catch(e) { await client.query('ROLLBACK'); throw e; }
}

if(process.argv[1]?.endsWith('reconcile-migrations.mjs')) {
  let client;
  try { client=await getPool().connect(); console.log(await reconcile(client,{apply:process.argv.includes('--apply'),repairChecksums:process.argv.includes('--repair-checksums')})); }
  catch(error) { console.error('Migration reconciliation stopped:',error.message);process.exitCode=1; }
  finally { client?.release();await closePool(); }
}
