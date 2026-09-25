import { existsSync } from 'node:fs';
import pg from 'pg';
import { connectionOptions } from '../database/postgres.mjs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
let pool;
export function getPool() { pool ||= new pg.Pool({ ...connectionOptions(process.env.DIRECT_URL || process.env.DATABASE_URL), max: 1 }); return pool; }
export async function closePool() { if(pool) { await pool.end(); pool=undefined; } }
export function reportError(error) {
  console.error('PostgreSQL operation failed:', error.code || 'ERROR', error.code === 'ENOTFOUND' ? 'Database host could not be resolved.' : 'Check connection, credentials and migration prerequisites.');
  process.exitCode = 1;
}
