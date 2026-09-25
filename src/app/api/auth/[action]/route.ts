import { randomUUID, createHash } from 'node:crypto';
import { body, failure, field, InputError, json, sameOrigin } from '@/lib/api';
import { createSession, currentUser, endSession, hashPassword, rateLimit, verifyPassword } from '@/lib/auth';
import { db } from '@/lib/db';
export const runtime = 'nodejs';
type Context = {
    params: Promise<{
        action: string;
    }>;
};
export async function GET(_request: Request, context: Context) {
    if ((await context.params).action !== 'me')
        return json({ error: 'No encontrado.' }, 404);
    return json({ usuario: await currentUser() });
}
export async function POST(request: Request, context: Context) {
    try {
        sameOrigin(request);
        const { action } = await context.params;
        if (action === 'logout') {
            await endSession();
            return json({ ok: true });
        }
        if (!['login', 'register', 'activate'].includes(action))
            return json({ error: 'No encontrado.' }, 404);
        const value = await body(request);
        const email = field(value.email, 'Correo', 254, true)!.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            throw new InputError('Correo inválido.');
        if (typeof value.password !== 'string' || value.password.length < 12 || value.password.length > 128)
            throw new InputError('La contraseña debe tener entre 12 y 128 caracteres.');
        (await rateLimit(`auth:${email}`));
        // Global ceiling does not trust spoofable forwarding headers.
        (await rateLimit('auth:global', 300));
        const existing = (await db().prepare('SELECT id, password_hash FROM usuarios WHERE email = ?').get(email));
        if (action === 'activate') {
            const token = field(value.token, 'Activación', 64, true)!;
            const tokenHash = createHash('sha256').update(token).digest('hex');
            const grant = (await db().prepare('SELECT t.usuario_id FROM setup_tokens t JOIN usuarios u ON u.id = t.usuario_id WHERE t.token_hash = ? AND t.expires_at > ? AND u.email = ? AND u.password_hash = ?').get(tokenHash, Date.now(), email, 'pending'));
            if (!grant)
                return json({ error: 'El enlace de activación no es válido o ha caducado.' }, 400);
            const passwordHash = await hashPassword(value.password);
            const database = db();
            (await database.begin(String(grant.usuario_id)));
            try {
                const used = (await database.prepare('DELETE FROM setup_tokens WHERE token_hash = ? AND expires_at > ? RETURNING usuario_id').get(tokenHash, Date.now()));
                if (!used)
                    throw new InputError('El enlace ya fue utilizado.');
                (await database.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ? AND password_hash = ?').run(passwordHash, grant.usuario_id, 'pending'));
                (await database.exec('COMMIT'));
            }
            catch (e) {
                (await database.exec('ROLLBACK'));
                throw e;
            }
            await createSession(String(grant.usuario_id), request);
        }
        else if (action === 'login') {
            const dummy = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
            const valid = await verifyPassword(value.password, String(existing?.password_hash === 'pending' ? dummy : existing?.password_hash || dummy));
            if (!existing || !valid)
                return json({ error: 'Correo o contraseña incorrectos.' }, 401);
            await createSession(String(existing.id), request);
        }
        else {
            if (process.env.ALLOW_REGISTRATION === 'false')
                return json({ error: 'El registro está cerrado.' }, 403);
            const name = field(value.nombre, 'Nombre profesional', 200, true)!;
            if (existing)
                return json({ error: 'No se pudo crear la cuenta con esos datos.' }, 409);
            const passwordHash = await hashPassword(value.password);
            const id = randomUUID();
            (await db().prepare("INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (?, ?, ?, ?, 'psicologo')").run(id, email, passwordHash, name));
            await createSession(id, request);
        }
        return json({ usuario: await currentUser() }, action === 'register' ? 201 : 200);
    }
    catch (error) {
        return failure(error);
    }
}
