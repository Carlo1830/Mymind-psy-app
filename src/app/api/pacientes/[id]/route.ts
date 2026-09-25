import { requireUser } from '@/lib/auth';
import { db, patient, sessions } from '@/lib/db';
import { body, failure, InputError, json, patientInput, sameOrigin } from '@/lib/api';
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
        const values = patientInput(await body(request));
        const record = (await db().prepare('UPDATE pacientes SET nombre_completo = ?, email = ?, telefono = ?, estado = ?, motivo_consulta = ?, notas_confidenciales = ? WHERE id = ? AND usuario_id = ? RETURNING *').get(...values, id, user.id));
        return record ? json(record) : json({ error: 'Paciente no encontrado.' }, 404);
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
