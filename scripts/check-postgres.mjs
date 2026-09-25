import { getPool, closePool } from '../database/postgres.mjs';
import { existsSync } from 'node:fs';
if(existsSync('.env.local')) process.loadEnvFile('.env.local');
try {
 const db = getPool();
 const tables = await db.query("SELECT count(*)::int AS total FROM pg_tables WHERE schemaname = 'mymind'");
 const user = await db.query('SELECT email, rol FROM mymind.usuarios WHERE email = $1', ['carlo12141518@gmail.com']);
 const unprotected = await db.query("SELECT count(*)::int AS total FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mymind' AND c.relkind='r' AND NOT c.relrowsecurity");
 if (!user.rows.length || user.rows[0].rol !== 'administrador' || unprotected.rows[0].total !== 0) throw Error('Readiness check failed');
 console.log({ connected: true, tables: tables.rows[0].total, administrator: user.rows[0], allTablesRlsEnabled: true });
} catch(e) { console.error('Database check failed:', e.code || 'SCHEMA_OR_SEED_MISSING'); process.exitCode=1; }
finally { await closePool(); }
