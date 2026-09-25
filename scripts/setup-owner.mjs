import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getPool, closePool, reportError } from './postgres-env.mjs';
export async function seedOwner(client, email, { writeActivation = true } = {}) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Invalid email');
  await client.query('BEGIN');
  let activation;
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('mymind:seed', 0))");
    const result = await client.query(`INSERT INTO mymind.usuarios (id, email, password_hash, nombre, rol)
      VALUES ($1, $2, 'pending', 'Profesional principal', 'administrador')
      ON CONFLICT(email) DO UPDATE SET rol = 'administrador' RETURNING id, password_hash`, [randomUUID(), email]);
    const user = result.rows[0];
    await client.query('INSERT INTO mymind.configuracion_sitio (id, profesional_id) VALUES (1, $1) ON CONFLICT(id) DO UPDATE SET profesional_id = excluded.profesional_id', [user.id]);
    await client.query('INSERT INTO mymind.reglas_disponibilidad (usuario_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    if (user.password_hash === 'pending' && writeActivation) {
      activation = randomBytes(32).toString('hex');
      await client.query('DELETE FROM mymind.setup_tokens WHERE usuario_id = $1', [user.id]);
      await client.query('INSERT INTO mymind.setup_tokens (token_hash, usuario_id, expires_at) VALUES ($1, $2, $3)', [createHash('sha256').update(activation).digest('hex'), user.id, Date.now() + 86400000]);
      mkdirSync('data', { recursive: true });
      const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
      writeFileSync('data/activar-cuenta-postgres.txt', `Enlace privado, valido durante 24 horas:\n${origin}/acceso?activacion=${activation}&email=${encodeURIComponent(email)}\n`, { mode: 0o600 });
    }
    await client.query('COMMIT');
    return { id: user.id, pending: user.password_hash === 'pending', activationCreated: Boolean(activation) };
  } catch(e) { await client.query('ROLLBACK'); throw e; }
}
if (process.argv[1]?.endsWith('setup-owner.mjs')) {
  let client;
  try {
    client = await getPool().connect();
    const result = await seedOwner(client, (process.argv[2] || 'carlo12141518@gmail.com').trim().toLowerCase());
    console.log('Principal administrator configured.');
    if(result.activationCreated) console.log('Private activation link: data/activar-cuenta-postgres.txt');
  } catch(e) { reportError(e); }
  finally { client?.release(); await closePool(); }
}
