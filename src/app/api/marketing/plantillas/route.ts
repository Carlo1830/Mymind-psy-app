import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { body, failure, field, InputError, json, sameOrigin } from '@/lib/api';
import { templateDefaults } from '@/lib/marketing-shared';
export const runtime = 'nodejs';
export async function GET() {
    try {
        const user = await requireUser();
        const insert = db().prepare('INSERT INTO plantillas (id, usuario_id, nombre, categoria, paso, dias_espera, asunto, contenido) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING');
        for (const t of templateDefaults)
            (await insert.run(randomUUID(), user.id, t.nombre, t.categoria, t.paso, t.dias_espera, t.asunto, t.contenido));
        return json((await db().prepare('SELECT id, nombre, categoria, paso, dias_espera, asunto, contenido FROM plantillas WHERE usuario_id = ? ORDER BY categoria, paso').all(user.id)));
    }
    catch (e) {
        return failure(e);
    }
}
export async function PUT(request: Request) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const v = await body(request);
        const id = field(v.id, 'Plantilla', 100, true);
        const name = field(v.nombre, 'Nombre', 200, true);
        const subject = field(v.asunto, 'Asunto', 200, true);
        const content = field(v.contenido, 'Mensaje', 10000, true);
        if (!Number.isInteger(v.dias_espera) || Number(v.dias_espera) < 0 || Number(v.dias_espera) > 365)
            throw new InputError('Días de espera inválidos.');
        const updated = (await db().prepare('UPDATE plantillas SET nombre = ?, asunto = ?, contenido = ?, dias_espera = ? WHERE id = ? AND usuario_id = ? RETURNING id, nombre, categoria, paso, dias_espera, asunto, contenido').get(name, subject, content, Number(v.dias_espera), id, user.id));
        return updated ? json(updated) : json({ error: 'Plantilla no encontrada.' }, 404);
    }
    catch (e) {
        return failure(e);
    }
}
