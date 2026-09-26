import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { body, estados, failure, InputError, json, patientInput, sameOrigin } from '@/lib/api';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
    try {
        const user = await requireUser();
        const params = new URL(request.url).searchParams;
        const search = (params.get('q') || '').trim();
        const state = params.get('estado') || '';
        const status = params.get('status') ?? 'active';
        if (!['active', 'archived'].includes(status)) throw new InputError('Status de paciente inválido.');
        if (state && !estados.includes(state as typeof estados[number]))
            throw new InputError('Estado inválido.');
        // JavaScript handles Spanish case and accent folding consistently, unlike SQLite lower().
        const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
        // Explicit public list fields: status is returned without clinical notes.
        const rows = await db().prepare(`
            SELECT p.id, p.nombre_completo, p.email, p.telefono, p.estado,
                   p.status AS status, p.fecha_registro, p.fuente_captacion,
                   (SELECT c.consentimiento_marketing FROM captaciones c
                    WHERE c.paciente_id = p.id
                    ORDER BY c.creado_en DESC, c.id DESC LIMIT 1) AS consentimiento_marketing
            FROM pacientes p
            WHERE p.usuario_id = ? AND p.status = ? AND (? = ? OR p.estado = ?)
            ORDER BY p.fecha_registro DESC, p.id DESC
        `).all(user.id, status, state, '', state);
        const patients = rows
            .filter(row => normalize(String(row.nombre_completo)).includes(normalize(search)))
            .map(row => {
                if (row.status !== 'active' && row.status !== 'archived') {
                    throw new Error('Invalid patient status in database response');
                }
                return {
                    id: row.id,
                    nombre_completo: row.nombre_completo,
                    email: row.email,
                    telefono: row.telefono,
                    estado: row.estado,
                    status: row.status,
                    fecha_registro: row.fecha_registro,
                    fuente_captacion: row.fuente_captacion,
                    consentimiento_marketing: row.consentimiento_marketing,
                };
            });
        return json(patients);
    }
    catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const values = patientInput(await body(request));
        const row = (await db().prepare('INSERT INTO pacientes (nombre_completo, email, telefono, estado, motivo_consulta, notas_confidenciales, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *').get(...values, user.id));
        return json(row, 201);
    }
    catch (error) {
        return failure(error);
    }
}
