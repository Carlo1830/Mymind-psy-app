import { patientTags } from '@/lib/patient-tags';
import { requireUser } from '@/lib/auth';
import { db, patient, sessions } from '@/lib/db';
import { body, failure, InputError, json, patientInput, sameOrigin } from '@/lib/api';
import { birthDate,savePatientBirth } from '@/lib/patient-birth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {
    params: Promise<{
        id: string;
    }>;
};
export async function GET(_request: Request, context: Context) {
    try {
        const user = await requireUser();
        const { id } = await context.params;
        const record = (await patient(id, user.id));
        return record ? json({ paciente: record, sesiones: (await sessions(id, user.id)) }) : json({ error: 'Paciente no encontrado.' }, 404);
    }
    catch (error) {
        return failure(error);
    }
}
export async function PUT(request: Request, context: Context) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const { id } = await context.params;
        const value = await body(request);
        const values = patientInput(value);
        let etiquetas: string[] = [];
        try { etiquetas = patientTags(value.etiquetas === undefined ? [] : value.etiquetas); } catch(e) { throw new InputError(e instanceof Error ? e.message : 'Etiquetas inválidas.'); }
        const tagUpdate = value.etiquetas === undefined ? '' : ', etiquetas = ARRAY(SELECT jsonb_array_elements_text(?::jsonb))';
        const birth=value.fecha_nacimiento===undefined?undefined:birthDate(value.fecha_nacimiento);
        const database=db();await database.begin(user.id);
        try{
            const record = await database.prepare('UPDATE pacientes SET nombre_completo = ?, email = ?, telefono = ?, estado = ?, motivo_consulta = ?, notas_confidenciales = ?' + tagUpdate + ' WHERE id = ? AND usuario_id = ? RETURNING *').get(...values, ...(value.etiquetas === undefined ? [] : [JSON.stringify(etiquetas)]), id, user.id);
            if(record&&birth!==undefined)await savePatientBirth(id,user.id,birth,database);
            await database.exec('COMMIT');
            return record ? json({...record,...(birth!==undefined?{fecha_nacimiento:birth}:{})}) : json({ error: 'Paciente no encontrado.' }, 404);
        }catch(error){await database.exec('ROLLBACK');throw error;}
    }
    catch (error) {
        return failure(error);
    }
}

export async function PATCH(request: Request, context: Context) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const { id } = await context.params;
        const value = await body(request);
        if (value.status !== 'active' && value.status !== 'archived') throw new InputError('Status de paciente inválido.');
        const record = await db().prepare('UPDATE pacientes SET status = ? WHERE id = ? AND usuario_id = ? RETURNING id, status').get(value.status, id, user.id);
        return record ? json(record) : json({ error: 'Paciente no encontrado.' }, 404);
    } catch (error) { return failure(error); }
}
