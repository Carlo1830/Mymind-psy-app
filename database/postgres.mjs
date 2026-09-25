import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const { Pool, types } = pg;
types.setTypeParser(20, value => Number(value));
types.setTypeParser(1184, value => new Date(value).toISOString());
const tables = ['usuarios', 'pacientes', 'sesiones', 'auth_sessions', 'rate_limits', 'plantillas', 'lead_magnets', 'captaciones', 'setup_tokens', 'configuracion_sitio', 'disponibilidad_publica', 'reservas_publicas', 'reglas_disponibilidad'];
let pool;
export function connectionOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const url = new URL(connectionString);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const caPath = process.env.DATABASE_SSL_CA_PATH || (/\.supabase\.(com|co)$/.test(url.hostname) ? path.join(process.cwd(), 'database/certs/supabase-ca.crt') : undefined);
  return { connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, 'utf8') } : {}) }, connectionTimeoutMillis: 10000, statement_timeout: 20000, idle_in_transaction_session_timeout: 30000 };
}
export function getPool() {
  if (!pool) {
    pool = new Pool({ ...connectionOptions(), max: 3, idleTimeoutMillis: 10000, allowExitOnIdle: true });
    pool.on('error', () => console.error('PostgreSQL idle connection error'));
  }
  return pool;
}
export async function closePool() { if (pool) { await pool.end(); pool = undefined; } }
export function compileQuery(sql) {
  let index = 0;
  sql = sql.replace(/'(?:''|[^'])*'|\?/g, match => match === '?' ? `$${++index}` : match);
  return sql.replace(new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+(${tables.join('|')})\\b`, 'gi'), '$1 mymind.$2');
}
function normalize(row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'boolean' ? Number(value) : value])); }
export class Database {
  client;
  constructor(executor) { this.executor = executor; }
  async query(sql, values = []) { return (this.client || this.executor || getPool()).query(compileQuery(sql), values); }
  prepare(sql) {
    return {
      get: async (...values) => { const result = await this.query(sql, values); return result.rows[0] ? normalize(result.rows[0]) : undefined; },
      all: async (...values) => (await this.query(sql, values)).rows.map(normalize),
      run: async (...values) => ({ changes: (await this.query(sql, values)).rowCount || 0 }),
    };
  }
  async begin(owner) {
    if (this.client) throw new Error('Nested transaction');
    this.client = await getPool().connect();
    try {
      await this.client.query('BEGIN');
      await this.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [owner]);
    } catch (error) { this.client.release(true); this.client = undefined; throw error; }
  }
  async exec(command) {
    if (!this.client && command === 'ROLLBACK') return;
    if (!this.client || !['COMMIT', 'ROLLBACK'].includes(command)) throw new Error('Invalid transaction operation');
    const client = this.client;
    this.client = undefined;
    let failed = false;
    try { await client.query(command); } catch (error) { failed = true; throw error; } finally { client.release(failed); }
  }
}
