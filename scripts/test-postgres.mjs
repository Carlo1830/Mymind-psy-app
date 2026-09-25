import test from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from './test-postgres-helper.mjs';
import { migrate } from './migrate-postgres.mjs';
import { seedOwner } from './setup-owner.mjs';
import { Database, compileQuery } from '../database/postgres.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { migrateCalendar } from '../database/migrate-calendar.mjs';
import { migrateSaas } from '../database/migrate-saas.mjs';
import { importSqlite } from './import-sqlite.mjs';

test('PostgreSQL schema, import, admin seed, repeated migration and private access', async () => {
 const instance = await testPostgres(55440);
 const c = instance.client;
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
