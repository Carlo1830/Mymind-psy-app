import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { publicProfessional, assertNoOverlap } from '@/lib/booking';
import { body, failure, field, InputError, json, sameOrigin } from '@/lib/api';
import { rateLimit } from '@/lib/auth';
import { HttpError } from '@/lib/errors';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    try {
        sameOrigin(request);
        const professional = (await publicProfessional());
        if (!professional)
            return json({ error: 'La reserva aún no está disponible.' }, 404);
        const v = await body(request);
        if (v.website)
            throw new InputError('No se pudo procesar la reserva.');
        const name = field(v.nombre_completo, 'Nombre', 200, true)!;
        const email = field(v.email, 'Correo', 254, true)!.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            throw new InputError('Correo inválido.');
        const phone = field(v.telefono, 'Teléfono', 50);
        const slotId = field(v.horario_id, 'Horario', 100, true)!;
        const nonce = field(v.solicitud_id, 'Solicitud', 100, true)!;
        if (!/^[0-9a-f-]{36}$/.test(nonce) || v.consentimiento !== true)
            throw new InputError('Acepta el uso de tus datos para gestionar la reserva.');
        (await rateLimit(`booking:${email}`, 8, 3600000));
        (await rateLimit('booking:global', 200, 3600000));
        const database = db();
        (await database.begin(professional.id));
        try {
            const previous = (await database.prepare('SELECT r.disponibilidad_id, s.fecha_hora, s.modalidad, s.duracion_minutos FROM reservas_publicas r JOIN sesiones s ON s.id = r.sesion_id WHERE r.id = ?').get(nonce));
            if (previous) {
                if (previous.disponibilidad_id !== slotId)
                    throw new InputError('Identificador de reserva ya utilizado.');
                (await database.exec('COMMIT'));
                return json({ fecha_hora: previous.fecha_hora, modalidad: previous.modalidad, duracion_minutos: previous.duracion_minutos, zona_horaria: professional.zona_horaria });
            }
            const slot = (await database.prepare('SELECT * FROM disponibilidad_publica WHERE id = ? AND usuario_id = ? AND publicado = 1 AND sesion_id IS NULL AND fecha_hora > ? AND fecha_hora < ?').get(slotId, professional.id, new Date().toISOString(), new Date(Date.now() + 90 * 86400000).toISOString()));
            if (!slot)
                throw new HttpError(409, 'Ese horario ya no está disponible. Actualiza la lista y elige otro.');
            if (!['Presencial', 'Online'].includes(String(v.modalidad)) || (slot.modalidad !== 'Ambas' && slot.modalidad !== v.modalidad))
                throw new InputError('Selecciona una modalidad disponible.');
            (await assertNoOverlap(professional.id, String(slot.fecha_hora), Number(slot.duracion_minutos), '', database));
            const existing = (await database.prepare('SELECT id FROM pacientes WHERE usuario_id = ? AND lower(email) = ? ORDER BY fecha_registro LIMIT 1').get(professional.id, email));
            const patientId = existing?.id || randomUUID();
            if (!existing)
                (await database.prepare("INSERT INTO pacientes (id, usuario_id, nombre_completo, email, telefono, estado, fuente_captacion) VALUES (?, ?, ?, ?, ?, 'Nuevo contacto', 'Reserva desde la web')").run(patientId, professional.id, name, email, phone));
            const sessionId = randomUUID();
            (await database.prepare("INSERT INTO sesiones (id, paciente_id, fecha_hora, duracion_minutos, modalidad, estado_sesion) VALUES (?, ?, ?, ?, ?, 'Programada')").run(sessionId, patientId, slot.fecha_hora, slot.duracion_minutos, String(v.modalidad)));
            (await database.prepare('UPDATE disponibilidad_publica SET sesion_id = ? WHERE id = ?').run(sessionId, slotId));
            (await database.prepare('INSERT INTO reservas_publicas (id, disponibilidad_id, sesion_id, consentimiento) VALUES (?, ?, ?, ?)').run(nonce, slotId, sessionId, 'Autorizo el registro de mis datos de contacto para gestionar esta reserva.'));
            (await database.exec('COMMIT'));
            return json({ fecha_hora: slot.fecha_hora, modalidad: v.modalidad, duracion_minutos: slot.duracion_minutos, zona_horaria: professional.zona_horaria }, 201);
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
