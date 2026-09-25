import { cookies } from 'next/headers';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { HttpError } from '@/lib/errors';
import { redirect } from 'next/navigation';
export type User = {
    id: string;
    email: string;
    rol: 'psicologo' | 'administrador';
    nombre: string;
    especialidad: string;
    tono: string;
    enlace_consulta: string;
};
export const userColumns = 'u.id, u.email, u.rol, u.nombre, u.especialidad, u.tono, u.enlace_consulta';
const cookieName = 'mymind_session';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function derive(password: string, salt: string): Promise<Buffer> {
    return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
    const [, salt, hash] = stored.split(':');
    const candidate = await derive(password, salt);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
export async function currentUser(): Promise<User | null> {
    const token = (await cookies()).get(cookieName)?.value;
    if (!token || !/^[a-f0-9]{64}$/.test(token))
        return null;
    return ((await db().prepare(`SELECT ${userColumns} FROM auth_sessions s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(digest(token), Date.now())) as User | undefined) || null;
}
export async function requireUser() {
    const user = await currentUser();
    if (!user || !['psicologo', 'administrador'].includes(user.rol))
        throw new HttpError(401, 'Inicia sesión para continuar.');
    return user;
}
export async function requirePageUser() {
    const user = await currentUser();
    if (!user)
        redirect('/acceso');
    return user;
}
export async function createSession(userId: string, request: Request) {
    const jar = await cookies();
    const old = jar.get(cookieName)?.value;
    if (old)
        (await db().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(digest(old)));
    const token = randomBytes(32).toString('hex');
    const lifetime = 8 * 60 * 60;
    (await db().prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(Date.now()));
    (await db().prepare('INSERT INTO auth_sessions (token_hash, usuario_id, expires_at) VALUES (?, ?, ?)').run(digest(token), userId, Date.now() + lifetime * 1000));
    const host = request.headers.get('host') || '';
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    jar.set(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: !local || process.env.APP_ORIGIN?.startsWith('https://') === true, path: '/', maxAge: lifetime });
}
export async function endSession() {
    const jar = await cookies();
    const token = jar.get(cookieName)?.value;
    if (token)
        (await db().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(digest(token)));
    jar.delete(cookieName);
}
export async function rateLimit(key: string, max = 15, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    (await db().prepare('DELETE FROM rate_limits WHERE reinicio <= ?').run(now));
    const row = (await db().prepare('INSERT INTO rate_limits (clave, intentos, reinicio) VALUES (?, 1, ?) ON CONFLICT(clave) DO UPDATE SET intentos = rate_limits.intentos + 1 RETURNING intentos').get(digest(key), now + windowMs))!;
    if (Number(row.intentos) > max)
        throw new HttpError(429, 'Demasiados intentos. Inténtalo más tarde.');
}
