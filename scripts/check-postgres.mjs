import { getPool, closePool } from '../database/postgres.mjs';
import { existsSync } from 'node:fs';
import { migrationFiles,readHistory } from './migration-history.mjs';
if(existsSync('.env.local')) process.loadEnvFile('.env.local');
try {
 const db = getPool();
 const files=migrationFiles();const {app,cli}=await readHistory(db,files);
 if(files.some(f=>!app.has(f.name)||!cli.has(f.version))) throw Error('Migration history incomplete');
 await db.query('SELECT id,usuario_id,paciente_id,tipo_test,nombre_test,modo,puntaje_total,respuestas,fecha_evaluacion,creado_en,version_baremo FROM mymind.evaluaciones_clinicas WHERE false');
 const tables = await db.query("SELECT count(*)::int AS total FROM pg_tables WHERE schemaname = 'mymind'");
 const user = await db.query('SELECT email, rol FROM mymind.usuarios WHERE email = $1', ['carlo12141518@gmail.com']);
 const unprotected = await db.query("SELECT count(*)::int AS total FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mymind' AND c.relkind='r' AND NOT c.relrowsecurity");
 if (!user.rows.length || user.rows[0].rol !== 'administrador' || unprotected.rows[0].total !== 0) throw Error('Readiness check failed');
 console.log({ connected: true, tables: tables.rows[0].total, administrator: user.rows[0], allTablesRlsEnabled: true, migrationHistoryConsistent:true });
} catch(e) { console.error('Database check failed:', e.code || 'SCHEMA_OR_SEED_MISSING'); process.exitCode=1; }
finally { await closePool(); }
