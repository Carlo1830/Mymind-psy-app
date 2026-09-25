import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/auth';
import { body, failure, field, InputError, json, sameOrigin } from '@/lib/api';
import { consentText } from '@/lib/marketing-shared';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {
    params: Promise<{
        id: string;
    }>;
};
async function published(id: string, database = db()) { return (await database.prepare('SELECT l.*, u.nombre AS profesional FROM lead_magnets l JOIN usuarios u ON u.id = l.usuario_id WHERE l.id = ? AND l.publicado = 1').get(id)); }
export async function GET(_r: Request, context: Context) {
    try {
        const row = (await published((await context.params).id));
        if (!row)
            return json({ error: 'Este recurso no está disponible.' }, 404);
        return json({ id: row.id, titulo: row.titulo, descripcion: row.descripcion, tipo: row.tipo, preguntas: JSON.parse(String(row.preguntas)), profesional: row.profesional, consentimiento: consentText });
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(request: Request, context: Context) {
    try {
        sameOrigin(request);
        const { id } = await context.params;
        const row = (await published(id));
        if (!row)
            return json({ error: 'Este recurso no está disponible.' }, 404);
        const v = await body(request);
        if (v.website)
            throw new InputError('No se pudo procesar la solicitud.');
        const name = field(v.nombre_completo, 'Nombre', 200, true);
        const email = field(v.email, 'Correo', 254, true)!.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            throw new InputError('Correo inválido.');
        if (v.consentimiento !== true)
            throw new InputError('Necesitamos tu autorización para registrar la solicitud.');
        if (v.marketing !== undefined && typeof v.marketing !== 'boolean')
            throw new InputError('Preferencia de contacto inválida.');
        const questions = JSON.parse(String(row.preguntas)) as string[];
        if (row.tipo === 'test' && (!Array.isArray(v.respuestas) || v.respuestas.length !== questions.length || v.respuestas.some(a => !Number.isInteger(a) || a < 0 || a > 3)))
            throw new InputError('Responde todas las preguntas.');
        (await rateLimit(`capture:${id}:${email}`, 5, 3600000));
        (await rateLimit(`capture:${id}`, 200, 3600000));
        const database = db();
        (await database.begin(String(row.usuario_id)));
        try {
            if (!(await published(id, database)))
                throw new InputError('El recurso ya no está disponible.');
            const existing = (await database.prepare('SELECT id FROM pacientes WHERE usuario_id = ? AND lower(email) = ? ORDER BY fecha_registro LIMIT 1').get(row.usuario_id, email));
            const patientId = existing?.id || randomUUID();
            if (!existing)
                (await database.prepare("INSERT INTO pacientes (id, usuario_id, nombre_completo, email, estado, fuente_captacion) VALUES (?, ?, ?, ?, 'Nuevo contacto', ?)").run(patientId, row.usuario_id, name, email, String(row.titulo)));
            (await database.prepare('INSERT INTO captaciones (id, magnet_id, paciente_id, consentimiento_contacto, consentimiento_marketing, texto_consentimiento) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING').run(randomUUID(), id, patientId, Number(v.marketing === true), consentText));
            (await database.exec('COMMIT'));
        }
        catch (e) {
            (await database.exec('ROLLBACK'));
            throw e;
        }
        return json({ titulo: row.titulo, contenido: row.contenido, tipo: row.tipo, mensaje: 'Tu solicitud quedó registrada. Aquí tienes el recurso.', aviso: row.tipo === 'test' ? 'Este ejercicio no tiene puntuación diagnóstica ni sustituye una evaluación profesional. Tus respuestas no se almacenan.' : '' }, 201);
    }
    catch (e) {
        return failure(e);
    }
}
