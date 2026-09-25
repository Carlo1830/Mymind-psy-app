import { generateAvailability } from '@/lib/availability';
import { randomUUID } from 'node:crypto';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { body, failure, field, InputError, json, sameOrigin } from '@/lib/api';
import { appointmentInput } from '@/lib/appointments';
import { assertNoOverlap, publicProfessional } from '@/lib/booking';
export const runtime = 'nodejs';
export async function GET() {
    try {
        const user = await requireUser();
        (await generateAvailability(user.id, (await publicProfessional())?.zona_horaria || 'America/Santiago'));
        return json({ regla: (await db().prepare('SELECT dias, hora_inicio, hora_fin, duracion_minutos, modalidad, activa FROM reglas_disponibilidad WHERE usuario_id = ?').get(user.id)) || null, es_profesional_publico: (await publicProfessional())?.id === user.id, horarios: (await db().prepare('SELECT id, fecha_hora, duracion_minutos, modalidad, publicado, sesion_id IS NOT NULL AS reservado FROM disponibilidad_publica WHERE usuario_id = ? AND fecha_hora > ? ORDER BY fecha_hora').all(user.id, new Date().toISOString())) });
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(request: Request) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const value = await body(request);
        const [, date, duration] = appointmentInput({ ...value, modalidad: value.modalidad === 'Ambas' ? 'Presencial' : value.modalidad, paciente_id: user.id, estado_sesion: 'Programada' });
        if (Date.parse(date) < Date.now() + 3600000 || Date.parse(date) > Date.now() + 365 * 86400000)
            throw new InputError('Publica un horario entre una hora y un año desde ahora.');
        const database = db();
        (await database.begin(user.id));
        try {
            (await assertNoOverlap(user.id, date, duration, '', database));
            const end = new Date(Date.parse(date) + duration * 60000).toISOString();
            if ((await database.prepare("SELECT id FROM disponibilidad_publica WHERE usuario_id = ? AND publicado = 1 AND (fecha_hora::timestamptz) < (?::timestamptz) AND (fecha_hora::timestamptz + duracion_minutos * interval '1 minute') > (?::timestamptz) LIMIT 1").get(user.id, end, date)))
                throw new InputError('Ya hay disponibilidad publicada en ese intervalo.');
            const id = randomUUID();
            (await database.prepare('INSERT INTO disponibilidad_publica (id, usuario_id, fecha_hora, duracion_minutos, modalidad) VALUES (?, ?, ?, ?, ?) ON CONFLICT(usuario_id, fecha_hora) DO UPDATE SET duracion_minutos = excluded.duracion_minutos, modalidad = excluded.modalidad, publicado = 1 WHERE disponibilidad_publica.sesion_id IS NULL').run(id, user.id, date, duration, String(value.modalidad)));
            (await database.exec('COMMIT'));
            return json({ ok: true }, 201);
        }
        catch (e) {
            (await database.exec('ROLLBACK'));
            throw e;
        }
    }
    catch (e) {
        return failure(e);
    }
}
export async function DELETE(request: Request) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const id = field((await body(request)).id, 'Horario', 100, true);
        const result = (await db().prepare('UPDATE disponibilidad_publica SET publicado = 0 WHERE id = ? AND usuario_id = ? AND sesion_id IS NULL').run(id, user.id));
        return result.changes ? json({ ok: true }) : json({ error: 'Horario no disponible para retirar.' }, 404);
    }
    catch (e) {
        return failure(e);
    }
}
export async function PUT(request: Request) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const v = await body(request);
        if (!Array.isArray(v.dias) || v.dias.length < 1 || v.dias.length > 7 || new Set(v.dias).size !== v.dias.length || v.dias.some(d => !Number.isInteger(d) || d < 0 || d > 6))
            throw new InputError('Selecciona los días de atención.');
        const start = field(v.hora_inicio, 'Hora inicial', 5, true)!;
        const end = field(v.hora_fin, 'Hora final', 5, true)!;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end)
            throw new InputError('El horario de fin debe ser posterior al inicio.');
        const duration = Number(v.duracion_minutos);
        const span = (Number(end.slice(0, 2)) - Number(start.slice(0, 2))) * 60 + Number(end.slice(3)) - Number(start.slice(3));
        if (!Number.isInteger(duration) || duration < 5 || duration > 480 || duration > span || !['Presencial', 'Online', 'Ambas'].includes(String(v.modalidad)) || typeof v.activa !== 'boolean')
            throw new InputError('Duración o modalidad inválidas.');
        const database = db();
        (await database.begin(user.id));
        try {
            (await database.prepare('INSERT INTO reglas_disponibilidad (usuario_id, dias, hora_inicio, hora_fin, duracion_minutos, modalidad, activa) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(usuario_id) DO UPDATE SET dias = excluded.dias, hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, duracion_minutos = excluded.duracion_minutos, modalidad = excluded.modalidad, activa = excluded.activa, version = reglas_disponibilidad.version + 1, generado_dia = ?').run(user.id, JSON.stringify(v.dias), start, end, duration, String(v.modalidad), Number(v.activa), ''));
            (await database.prepare('UPDATE disponibilidad_publica SET publicado = 0 WHERE usuario_id = ? AND regla_version > 0 AND sesion_id IS NULL AND fecha_hora > ?').run(user.id, new Date().toISOString()));
            (await database.exec('COMMIT'));
        }
        catch (e) {
            (await database.exec('ROLLBACK'));
            throw e;
        }
        (await generateAvailability(user.id, (await publicProfessional())?.zona_horaria || 'America/Santiago'));
        return json({ ok: true });
    }
    catch (e) {
        return failure(e);
    }
}
