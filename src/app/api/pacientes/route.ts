import { patientTags, tagKey } from '@/lib/patient-tags';
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
        const tag = params.get('etiqueta') || '';
        if(tag.length>50) throw new InputError('Etiqueta demasiado larga.');
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
                   COALESCE(p.status, 'active') AS status, COALESCE(to_jsonb(p)->'etiquetas','[]'::jsonb) AS etiquetas, p.fecha_registro, p.fuente_captacion,
                   (SELECT c.consentimiento_marketing FROM captaciones c
                    WHERE c.paciente_id = p.id
                    ORDER BY c.creado_en DESC, c.id DESC LIMIT 1) AS consentimiento_marketing
            FROM pacientes p
            WHERE p.usuario_id = ? AND COALESCE(p.status, 'active') = ? AND (? = ? OR p.estado = ?)
            ORDER BY p.fecha_registro DESC, p.id DESC
        `).all(user.id, status, state, '', state);
        const patients = rows
            .filter(row => normalize(String(row.nombre_completo)).includes(normalize(search)))
            .filter(row => !tag || (Array.isArray(row.etiquetas) && row.etiquetas.some((label: string) => tagKey(label) === tagKey(tag))))
            .map(row => {
                return {
                    id: row.id,
                    nombre_completo: row.nombre_completo,
                    email: row.email,
                    telefono: row.telefono,
                    estado: row.estado,
                    status: row.status || 'active',
                    etiquetas: row.etiquetas,
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
        const value = await body(request);
        const values = patientInput(value);
        let etiquetas: string[] = [];
        try { etiquetas = patientTags(value.etiquetas === undefined ? [] : value.etiquetas); } catch(e) { throw new InputError(e instanceof Error ? e.message : 'Etiquetas inválidas.'); }
        const row = await db().prepare('INSERT INTO pacientes (nombre_completo, email, telefono, estado, motivo_consulta, notas_confidenciales, usuario_id, etiquetas) VALUES (?, ?, ?, ?, ?, ?, ?, ARRAY(SELECT jsonb_array_elements_text(?::jsonb))) RETURNING *').get(...values, user.id, JSON.stringify(etiquetas));
        return json(row, 201);
    }
    catch (error) {
        return failure(error);
    }
}
