import { assertNoOverlap } from '@/lib/booking';
import { requireUser } from '@/lib/auth';
import { db, patient } from '@/lib/db';
import { body, failure, InputError, json, sameOrigin } from '@/lib/api';
import { appointmentColumns, appointmentInput, isoDate } from '@/lib/appointments';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    try {
        const user = await requireUser();
        const params = new URL(request.url).searchParams;
        const start = isoDate(params.get('desde'));
        const end = isoDate(params.get('hasta'));
        if (end <= start || Date.parse(end) - Date.parse(start) > 100 * 86400000)
            throw new InputError('Selecciona un intervalo de hasta 100 días.');
        return json((await db().prepare(`SELECT ${appointmentColumns} FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE p.usuario_id = ? AND (s.fecha_hora::timestamptz) >= (?::timestamptz) AND (s.fecha_hora::timestamptz) < (?::timestamptz) ORDER BY s.fecha_hora, s.id`).all(user.id, start, end)));
    }
    catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const values = appointmentInput(await body(request));
        if (!(await patient(values[0], user.id)))
            return json({ error: 'Paciente no encontrado.' }, 404);
        const database = db();
        (await database.begin(user.id));
        try {
            if (values[3] !== 'Cancelada')
                (await assertNoOverlap(user.id, values[1], values[2], '', database));
            const created = (await database.prepare('INSERT INTO sesiones (paciente_id, fecha_hora, duracion_minutos, estado_sesion, modalidad) VALUES (?, ?, ?, ?, ?) RETURNING id').get(...values))!;
            const row = (await database.prepare(`SELECT ${appointmentColumns} FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE s.id = ? AND p.usuario_id = ?`).get(created.id, user.id));
            (await database.exec('COMMIT'));
            return json(row, 201);
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
