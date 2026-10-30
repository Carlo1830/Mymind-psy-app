import { randomUUID } from 'node:crypto';
import { recurrenceDates } from '@/lib/recurrence';
import { after } from 'next/server';
import { processAgendaEmails } from '@/lib/agenda-email';
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
        const input = await body(request);
        const values = appointmentInput(input);
        let dates: string[];
        try { dates = recurrenceDates(values[1], Number(input.repeticiones ?? 1), Number(input.intervalo_semanas ?? 1), String(input.zona_horaria ?? 'America/Santiago')); }
        catch(e) { throw new InputError(e instanceof Error ? e.message : 'Recurrencia inválida.'); }
        if(dates.length>1 && values[3]!=='Programada') throw new InputError('Las series deben crearse como programadas.');
        if(['Ausente','Realizada'].includes(values[3]) && Date.parse(values[1])>Date.now()) throw new InputError('No puedes marcar realizada o ausente una cita futura.');
        const series = dates.length>1 ? randomUUID() : null;
        if (!(await patient(values[0], user.id)))
            return json({ error: 'Paciente no encontrado.' }, 404);
        const database = db();
        (await database.begin(user.id));
        try {
            let firstId: unknown;
            for(const date of dates) {
                if (values[3] !== 'Cancelada') await assertNoOverlap(user.id, date, values[2], '', database);
                const created = (await database.prepare('INSERT INTO sesiones (paciente_id, fecha_hora, duracion_minutos, estado_sesion, modalidad, serie_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').get(values[0],date,values[2],values[3],values[4],series))!;
                firstId ??= created.id;
            }
            const row = (await database.prepare(`SELECT ${appointmentColumns} FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE s.id = ? AND p.usuario_id = ?`).get(String(firstId), user.id));
            (await database.exec('COMMIT'));
            after(async () => { try { await processAgendaEmails(); } catch { console.error('Agenda email processing deferred to scheduler'); } });
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
