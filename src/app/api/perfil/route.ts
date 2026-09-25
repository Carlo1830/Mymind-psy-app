import { body, failure, field, InputError, json, sameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
export const runtime = 'nodejs';
export async function GET() { try {
    return json(await requireUser());
}
catch (e) {
    return failure(e);
} }
export async function PUT(request: Request) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const value = await body(request);
        const name = field(value.nombre, 'Nombre', 200, true);
        const specialty = field(value.especialidad, 'Especialidad', 500) || '';
        if (!['Empático', 'Educativo', 'Clínico/Divulgativo'].includes(String(value.tono)))
            throw new InputError('Tono inválido.');
        const link = field(value.enlace_consulta, 'Enlace de consulta', 1000) || '';
        if (link) {
            let url;
            try {
                url = new URL(link);
            }
            catch {
                throw new InputError('Enlace inválido.');
            }
            if (url.protocol !== 'https:')
                throw new InputError('El enlace debe usar HTTPS.');
        }
        (await db().prepare('UPDATE usuarios SET nombre = ?, especialidad = ?, tono = ?, enlace_consulta = ? WHERE id = ?').run(name, specialty, String(value.tono), link, user.id));
        return json(await requireUser());
    }
    catch (e) {
        return failure(e);
    }
}
