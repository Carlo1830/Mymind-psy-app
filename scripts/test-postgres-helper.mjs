import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { migrate } from './migrate-postgres.mjs';
export async function testPostgres(port = 55439) {
  const engine = await PGlite.create();
  const socket = new PGLiteSocketServer({ db: engine, host: '127.0.0.1', port, maxConnections: 10 });
  await socket.start();
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { await migrate(client); } catch(e) { await client.end(); await socket.stop(); await engine.close(); throw e; }
  return { url, client, close: async () => { await client.end(); await socket.stop(); await engine.close(); } };
}

