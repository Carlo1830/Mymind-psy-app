import { requireUser } from '@/lib/auth';
import { db, patient } from '@/lib/db';
import { body, failure, json, sameOrigin } from '@/lib/api';
import { appointmentColumns, appointmentInput } from '@/lib/appointments';
import { assertNoOverlap } from '@/lib/booking';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {
    params: Promise<{
        id: string;
    }>;
};
export async function PUT(request: Request, context: Context) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const { id } = await context.params;
        const values = appointmentInput(await body(request));
        if (!(await patient(values[0], user.id)))
            return json({ error: 'Paciente no encontrado.' }, 404);
        const database = db();
        (await database.begin(user.id));
        try {
            const existing = (await database.prepare('SELECT s.paciente_id, s.fecha_hora FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE s.id = ? AND p.usuario_id = ?').get(id, user.id));
            if (!existing) {
                (await database.exec('ROLLBACK'));
                return json({ error: 'Cita no encontrada.' }, 404);
            }
            if (existing.paciente_id !== values[0]) {
                (await database.exec('ROLLBACK'));
                return json({ error: 'No se puede trasladar una sesión clínica a otro paciente.' }, 400);
            }
            if (values[3] !== 'Cancelada')
                (await assertNoOverlap(user.id, values[1], values[2], id, database));
            (await database.prepare('UPDATE sesiones SET fecha_hora = ?, duracion_minutos = ?, estado_sesion = ?, modalidad = ? WHERE id = ? AND paciente_id = ?').run(...values.slice(1), id, values[0]));
            if (values[3] === 'Cancelada' || existing.fecha_hora !== values[1])
                (await database.prepare('UPDATE disponibilidad_publica SET publicado = 0, sesion_id = NULL WHERE sesion_id = ? AND usuario_id = ?').run(id, user.id));
            const result = (await database.prepare(`SELECT ${appointmentColumns} FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE s.id = ? AND p.usuario_id = ?`).get(id, user.id));
            (await database.exec('COMMIT'));
            return json(result);
        }
        catch (e) {
            (await database.exec('ROLLBACK'));
            throw e;
        }
    }
    catch (error) {
        return failure(error);
    }
}
