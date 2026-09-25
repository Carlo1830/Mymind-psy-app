import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { getPool, closePool, reportError } from './postgres-env.mjs';
const tables = ['usuarios', 'pacientes', 'sesiones', 'plantillas', 'lead_magnets', 'captaciones', 'configuracion_sitio', 'reglas_disponibilidad', 'disponibilidad_publica', 'reservas_publicas'];
export async function importSqlite(client, filename) {
  if (!existsSync(filename)) throw Error('SQLite source does not exist');
  const source = new DatabaseSync(filename, { readOnly: true });
  source.exec('BEGIN');
  const counts = {};
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('mymind:import', 0))");
    // Destination must be unused or an exact replay. Conflicts abort the entire import.
    for (const table of tables) {
      const rows = source.prepare(`SELECT * FROM ${table}`).all();
      const columns = (await client.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', ['mymind', table])).rows;
      const allowed = new Set(columns.map(c => c.column_name));
      const dates = new Set(columns.filter(c => c.data_type === 'timestamp with time zone').map(c => c.column_name));
      const primary = table === 'reglas_disponibilidad' ? 'usuario_id' : 'id';
      let inserted = 0;
      for (const row of rows) {
        if (table === 'pacientes' && !row.usuario_id) throw Error('Assign orphan patients in SQLite before importing');
        const keys = Object.keys(row).filter(k => allowed.has(k));
        const normalize = (key, value) => value != null && dates.has(key) ? new Date(value).toISOString() : value;
        const prior = await client.query(`SELECT * FROM mymind.${table} WHERE ${primary} = $1`, [row[primary]]);
        if (prior.rows.length) {
          if (keys.some(k => normalize(k, prior.rows[0][k]) !== normalize(k, row[k]))) throw Error(`Import conflict in ${table}; destination was not modified`);
          continue;
        }
        await client.query(`INSERT INTO mymind.${table} (${keys.map(k => '"' + k + '"').join(',')}) VALUES (${keys.map((_,i) => '$' + (i+1)).join(',')})`, keys.map(k => row[k]));
        inserted++;
      }
      counts[table] = { source: rows.length, inserted };
    }
    await client.query('COMMIT');
    return counts;
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { source.exec('ROLLBACK'); source.close(); }
}
if (process.argv[1]?.endsWith('import-sqlite.mjs')) {
  let client;
  try {
    client = await getPool().connect();
    console.log(await importSqlite(client, process.argv[2] || 'data/mymind.sqlite'));
    console.log('Data copied. Source unchanged. Login sessions, rate limits and activation tokens are not copied.');
  } catch(e) { reportError(e); }
  finally { client?.release(); await closePool(); }
}
