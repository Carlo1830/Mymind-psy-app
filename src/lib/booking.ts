import { db } from '@/lib/db';
import { HttpError } from '@/lib/errors';
export async function publicProfessional() {
    return (await db().prepare('SELECT u.id, u.nombre, u.especialidad, c.zona_horaria FROM configuracion_sitio c JOIN usuarios u ON u.id = c.profesional_id WHERE c.id = 1').get()) as {
        id: string;
        nombre: string;
        especialidad: string;
        zona_horaria: string;
    } | undefined;
}
export async function assertNoOverlap(owner: string, date: string, duration: number, exclude = '', database = db(), excludeRequest = '') {
    const end = new Date(Date.parse(date) + duration * 60000).toISOString();
    const collision = (await database.prepare("SELECT s.id FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE p.usuario_id = ? AND s.estado_sesion != 'Cancelada' AND s.id != ? AND (s.fecha_hora::timestamptz) < (?::timestamptz) AND (s.fecha_hora::timestamptz + s.duracion_minutos * interval '1 minute') > (?::timestamptz) LIMIT 1").get(owner, exclude, end, date));
    if (collision)
        throw new HttpError(409, 'Ese horario se superpone con una cita. Elige otro.');
    const held = await database.prepare(`SELECT id FROM mymind.solicitudes_cita WHERE usuario_id=? AND estado='pendiente'
      AND vence_en>now() AND id<>? AND fecha_hora<?::timestamptz
      AND fecha_hora+duracion_minutos*interval '1 minute'>?::timestamptz LIMIT 1`).get(owner,excludeRequest,end,date);
    if (held) throw new HttpError(409,'Ese horario está reservado por una solicitud pendiente.');
}
export async function availableSlots(owner: string) {
    const now = new Date().toISOString();
    const limit = new Date(Date.now() + 90 * 86400000).toISOString();
    return (await db().prepare(`SELECT d.id, d.fecha_hora, d.duracion_minutos, d.modalidad FROM disponibilidad_publica d
    WHERE d.usuario_id = ? AND d.publicado = 1 AND d.sesion_id IS NULL AND d.fecha_hora > ? AND d.fecha_hora < ?
    AND d.fecha_hora >= now() + (SELECT solicitud_anticipacion_horas FROM mymind.usuarios WHERE id=d.usuario_id) * interval '1 hour'
    AND NOT EXISTS (SELECT 1 FROM mymind.solicitudes_cita r WHERE r.usuario_id=d.usuario_id AND r.estado='pendiente' AND r.vence_en>now()
      AND r.fecha_hora<d.fecha_hora+d.duracion_minutos*interval '1 minute' AND r.fecha_hora+r.duracion_minutos*interval '1 minute'>d.fecha_hora)
    AND NOT EXISTS (SELECT 1 FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE p.usuario_id = d.usuario_id AND s.estado_sesion != 'Cancelada'
      AND (s.fecha_hora::timestamptz) < (d.fecha_hora::timestamptz + d.duracion_minutos * interval '1 minute')
      AND (s.fecha_hora::timestamptz + s.duracion_minutos * interval '1 minute') > (d.fecha_hora::timestamptz))
    ORDER BY d.fecha_hora`).all(owner, now, limit));
}
