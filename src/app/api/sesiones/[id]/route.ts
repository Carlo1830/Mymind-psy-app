import { HttpError } from '@/lib/errors';
import { after } from 'next/server';
import { processAgendaEmails } from '@/lib/agenda-email';
import { requireUser } from '@/lib/auth';
import { db, patient } from '@/lib/db';
import { body, failure, InputError, json, sameOrigin } from '@/lib/api';
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
        const input = await body(request);
        const values = appointmentInput(input);
        if(input.alcance && !['cita','futuras'].includes(String(input.alcance))) throw new InputError('Alcance inválido.');
        if (!(await patient(values[0], user.id)))
            return json({ error: 'Paciente no encontrado.' }, 404);
        const database = db();
        (await database.begin(user.id));
        try {
            const existing = (await database.prepare('SELECT s.* FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE s.id = ? AND p.usuario_id = ?').get(id, user.id));
            if (!existing) {
                (await database.exec('ROLLBACK'));
                return json({ error: 'Cita no encontrada.' }, 404);
            }
            if (existing.paciente_id !== values[0]) {
                (await database.exec('ROLLBACK'));
                return json({ error: 'No se puede trasladar una sesión clínica a otro paciente.' }, 400);
            }
            const future = input.alcance==='futuras';
            if(future && (!existing.serie_id || existing.fecha_hora!==values[1] || !['Programada','Cancelada'].includes(values[3]))) throw new InputError('Para la serie conserva la fecha y elige Programada o Cancelada. Reprograma cada cita individualmente.');
            const targets = future ? await database.prepare("SELECT s.* FROM sesiones s JOIN pacientes p ON p.id=s.paciente_id WHERE p.usuario_id=? AND s.serie_id=? AND s.fecha_hora>=? AND s.fecha_hora::timestamptz>now() AND s.estado_sesion='Programada' ORDER BY s.fecha_hora").all(user.id,existing.serie_id,existing.fecha_hora) : [existing];
            if(!targets.length) throw new InputError('No hay citas futuras programadas para actualizar.');
            if(input.confirmacion!==undefined && !['pendiente','confirmada'].includes(String(input.confirmacion))) throw new InputError('Confirmación inválida.');
            if(future && input.confirmacion==='confirmada') throw new InputError('Registra la confirmación del paciente para cada cita.');
            for(const target of targets) {
                const date=future ? String(target.fecha_hora) : values[1];
                if(['Ausente','Realizada'].includes(values[3]) && Date.parse(date)>Date.now()) throw new InputError('No puedes marcar realizada o ausente una cita futura.');
                if(await database.prepare("SELECT id FROM mymind.notas_clinicas WHERE sesion_id=? AND estado='finalizada'").get(target.id)) {
                    if(target.fecha_hora!==date||target.duracion_minutos!==values[2]||target.estado_sesion!==values[3]||target.modalidad!==values[4]) throw new HttpError(409,'Esta sesión tiene una nota finalizada. Sus datos se conservan; registra una nueva cita si corresponde.');
                }
                if(values[3]!=='Cancelada') await assertNoOverlap(user.id,date,values[2],String(target.id),database);
                await database.prepare('UPDATE sesiones SET fecha_hora=?,duracion_minutos=?,estado_sesion=?,modalidad=? WHERE id=?').run(date,values[2],values[3],values[4],target.id);
                if(input.confirmacion!==undefined && !future && values[3]==='Programada') {
                    await database.prepare("UPDATE sesiones SET estado_confirmacion=?,confirmada_en=CASE WHEN ?='confirmada' THEN now() ELSE NULL END,confirmacion_fuente=CASE WHEN ?='confirmada' THEN 'profesional' ELSE NULL END WHERE id=?").run(String(input.confirmacion),String(input.confirmacion),String(input.confirmacion),target.id);
                }
                if(values[3]==='Cancelada'||target.fecha_hora!==date) await database.prepare('UPDATE disponibilidad_publica SET publicado=0,sesion_id=NULL WHERE sesion_id=? AND usuario_id=?').run(target.id,user.id);
            }
            const result = await database.prepare(`SELECT ${appointmentColumns} FROM sesiones s JOIN pacientes p ON p.id=s.paciente_id WHERE s.id=? AND p.usuario_id=?`).get(id,user.id);
            (await database.exec('COMMIT'));
            after(async () => { try { await processAgendaEmails(); } catch { console.error('Agenda email processing deferred to scheduler'); } });
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
