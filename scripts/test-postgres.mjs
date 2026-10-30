import test from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from './test-postgres-helper.mjs';
import { migrate } from './migrate-postgres.mjs';
import { seedOwner } from './setup-owner.mjs';
import { Database, compileQuery } from '../database/postgres.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { migrateCalendar } from '../database/migrate-calendar.mjs';
import { migrateSaas } from '../database/migrate-saas.mjs';
import { importSqlite } from './import-sqlite.mjs';
import { reconcile,referenceContracts } from './reconcile-migrations.mjs';
import { reconciliationSql } from './generate-reconciliation-sql.mjs';

test('PostgreSQL schema, import, admin seed, repeated migration and private access', async () => {
 const instance = await testPostgres(55440);
 const c = instance.client;
 mkdirSync('data',{recursive:true});
 const file = `data/migration-test-${randomUUID()}.sqlite`;
 try {
  await migrate(c);
  const local = new DatabaseSync(file);
  local.exec(readFileSync('database/schema.sql','utf8')); migrateCalendar(local); migrateSaas(local);
  local.prepare("INSERT INTO usuarios (id,email,password_hash,nombre) VALUES ('owner','carlo12141518@gmail.com','pending','Principal')").run();
  local.prepare("INSERT INTO pacientes (id,usuario_id,nombre_completo,notas_confidenciales) VALUES ('patient','owner','Synthetic','Confidential test note')").run();
  local.prepare("INSERT INTO sesiones (id,paciente_id,fecha_hora,notas_evolucion) VALUES ('session','patient','2026-09-24T13:00:00.000Z','Evolution preserved')").run(); local.close();
  const first = await importSqlite(c,file); assert.equal(first.pacientes.inserted,1);
  const second = await importSqlite(c,file); assert.equal(second.pacientes.inserted,0);
  const seeded=await seedOwner(c,'carlo12141518@gmail.com',{writeActivation:false}); assert.equal(seeded.id,'owner');
  await seedOwner(c,'carlo12141518@gmail.com',{writeActivation:false});
  const db = new Database(c);
  assert.equal((await db.prepare('SELECT rol FROM usuarios WHERE id = ?').get('owner')).rol,'administrador');
  assert.equal((await db.prepare('SELECT notas_confidenciales FROM pacientes WHERE id = ?').get('patient')).notas_confidenciales,'Confidential test note');
  assert.equal((await db.prepare('SELECT notas_evolucion FROM sesiones WHERE id = ?').get('session')).notas_evolucion,'Evolution preserved');
  assert.equal((await db.prepare('SELECT duracion_minutos FROM reglas_disponibilidad WHERE usuario_id = ?').get('owner')).duracion_minutos,50);
  await assert.rejects(db.prepare('UPDATE pacientes SET usuario_id = ? WHERE id = ?').run('other','patient'),{code:'23514'});
  await c.query('CREATE ROLE anon');
  await c.query('SET ROLE anon');
  await assert.rejects(c.query('SELECT * FROM mymind.pacientes'),{code:'42501'});
  await c.query('RESET ROLE');
  const unprotected=await c.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='mymind' AND c.relkind='r' AND NOT c.relrowsecurity");
  assert.equal(unprotected.rows.length,0);
  await db.prepare("UPDATE pacientes SET notas_confidenciales = 'Changed remotely' WHERE id = ?").run('patient');
  await assert.rejects(importSqlite(c,file),/Import conflict/);
  assert.equal((await db.prepare('SELECT notas_confidenciales FROM pacientes WHERE id = ?').get('patient')).notas_confidenciales,'Changed remotely');
 } finally { await instance.close(); unlinkSync(file); }
});
test('Parameters remain bound and quoted question marks are preserved',()=>{
 assert.equal(compileQuery("SELECT '?' AS literal FROM pacientes WHERE id = ?"),"SELECT '?' AS literal FROM mymind.pacientes WHERE id = $1");
});

test('Migration histories reconcile only after SQL and schema verification, and remain repeatable', async()=>{
 const instance=await testPostgres(55442); const c=instance.client;
 try {
  const contracts=await referenceContracts();
  await c.query("DELETE FROM mymind.schema_migrations WHERE name>'202609250001_patient_archive.sql'");
  await assert.rejects(migrate(c),/Reconcile history first/);
  await c.query('ALTER TABLE mymind.evaluaciones_clinicas RENAME COLUMN creado_en TO missing_creado_en');
  await assert.rejects(reconcile(c,{apply:true,contracts}),/Schema differs/);
  assert.equal((await c.query('SELECT count(*)::int AS n FROM mymind.schema_migrations')).rows[0].n,2);
  await c.query('ALTER TABLE mymind.evaluaciones_clinicas RENAME COLUMN missing_creado_en TO creado_en');
  assert.equal((await reconcile(c,{contracts})).adopted.length,7);
  assert.equal((await c.query('SELECT count(*)::int AS n FROM mymind.schema_migrations')).rows[0].n,2);
  await c.query("UPDATE supabase_migrations.schema_migrations SET statements=ARRAY['SELECT 1'] WHERE version='202610260001'");
  await assert.rejects(reconcile(c,{apply:true,contracts}),/Supabase SQL differs/);
  const {migrationFiles}=await import('./migration-history.mjs');
  const clinical=migrationFiles().find(f=>f.version==='202610260001');
  await c.query('UPDATE supabase_migrations.schema_migrations SET statements=$1 WHERE version=$2',[[clinical.sql],clinical.version]);
  // Exercise the SQL Editor path as well as the Node command.
  await c.query(await reconciliationSql());
  assert.equal((await c.query('SELECT count(*)::int AS n FROM mymind.schema_migrations')).rows[0].n,9);
  await migrate(c); await migrate(c);
  assert.equal((await reconcile(c,{apply:true,contracts})).adopted.length,0);
  const {legacyChecksums}=await import('./migration-history.mjs');
  for(const [name,checksum] of Object.entries(legacyChecksums)) await c.query('UPDATE mymind.schema_migrations SET checksum=$2 WHERE name=$1',[name,checksum]);
  await assert.rejects(reconcile(c,{apply:true,contracts}),/Applied migration changed/);
  await c.query("DELETE FROM mymind.schema_migrations WHERE name='202610270001_reconcile_schema.sql'; DELETE FROM supabase_migrations.schema_migrations WHERE version='202610270001'");
  await c.query(await reconciliationSql({repairChecksums:true,applyGuard:true}));
  assert.equal((await c.query('SELECT count(*)::int AS n FROM mymind.migration_reconciliation_audit')).rows[0].n,2);
  await migrate(c);
 } finally { await instance.close(); }
});

test('Clinical care SQL Editor delivery is atomic, repeatable and checks both ledgers',async()=>{
 const { PGlite }=await import('@electric-sql/pglite');
 const { migrationFiles,historyTables,recordSupabase }=await import('./migration-history.mjs');
 const { pendingMigrationSql }=await import('./generate-migration-sql.mjs');
 const engine=await PGlite.create();
 const c={query:(sql,args)=>engine.query(sql,args)};
 try {
  await historyTables(c);
  for(const f of migrationFiles().slice(0,-1)){
   await engine.exec(f.sql);
   await c.query('INSERT INTO mymind.schema_migrations(name,checksum) VALUES($1,$2)',[f.name,f.checksum]);
   await recordSupabase(c,f);
  }
  const sql=pendingMigrationSql();
  await engine.exec(sql.replaceAll('\n','\r\n'));
  await engine.exec(sql);
  assert.equal((await c.query('SELECT count(*)::int AS n FROM mymind.schema_migrations')).rows[0].n,migrationFiles().length);
  assert.equal((await c.query("SELECT relrowsecurity FROM pg_class WHERE oid='mymind.notas_clinicas'::regclass")).rows[0].relrowsecurity,true);
  await c.query("UPDATE supabase_migrations.schema_migrations SET statements=ARRAY['SELECT 1'] WHERE version='202610300001'");
  await assert.rejects(engine.exec(sql),/Migration history mismatch/);
  await engine.exec('ROLLBACK');
 }finally{await engine.close();}
});
