import { requireUser } from '@/lib/auth';
import { db, patient } from '@/lib/db';
import { body, failure, field, InputError, json, sameOrigin } from '@/lib/api';
export const runtime = 'nodejs';
type Context = {
    params: Promise<{
        id: string;
    }>;
};
export async function POST(request: Request, context: Context) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const { id } = await context.params;
        if (!(await patient(id, user.id)))
            return json({ error: 'Paciente no encontrado.' }, 404);
        const value = await body(request);
        const note = field(value.notas_evolucion, 'Nota de evolución', 20000, true);
        const date = field(value.fecha_hora, 'Fecha y hora', 40, true)!;
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(date) || !Number.isFinite(Date.parse(date)))
            throw new InputError('Fecha y hora inválidas.');
        const iso = new Date(date).toISOString();
        if (iso !== date.replace(/Z$/, date.includes('.') ? 'Z' : '.000Z'))
            throw new InputError('Fecha y hora inválidas.');
        const sessionId = field(value.sesion_id, 'Sesión', 100);
        if (sessionId) {
            const updated = (await db().prepare("UPDATE sesiones SET notas_evolucion = CASE WHEN notas_evolucion IS NULL OR notas_evolucion = '' THEN ? ELSE notas_evolucion || chr(10) || chr(10) || ? END WHERE id = ? AND paciente_id = ? RETURNING *").get(`[${iso}]\n${note}`, `[${iso}]\n${note}`, sessionId, id));
            return updated ? json(updated) : json({ error: 'Sesión no encontrada para este paciente.' }, 404);
        }
        const session = (await db().prepare("INSERT INTO sesiones (paciente_id, fecha_hora, estado_sesion, notas_evolucion) VALUES (?, ?, 'Realizada', ?) RETURNING *").get(id, iso, `[${iso}]\n${note}`));
        return json(session, 201);
    }
    catch (error) {
        return failure(error);
    }
}
