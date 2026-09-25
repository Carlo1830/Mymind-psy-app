import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { body, failure, field, InputError, json, sameOrigin } from '@/lib/api';
export const runtime = 'nodejs';
function decode(row: Record<string, unknown>) { return { ...row, preguntas: JSON.parse(String(row.preguntas)), publicado: row.publicado === 1 }; }
export async function GET() {
    try {
        const user = await requireUser();
        return json((await db().prepare('SELECT l.*, (SELECT count(*) FROM captaciones c WHERE c.magnet_id = l.id) AS captaciones FROM lead_magnets l WHERE l.usuario_id = ? ORDER BY l.creado_en DESC').all(user.id)).map(decode));
    }
    catch (e) {
        return failure(e);
    }
}
async function save(request: Request, update: boolean) {
    try {
        const user = await requireUser();
        sameOrigin(request);
        const v = await body(request);
        const title = field(v.titulo, 'Título', 200, true);
        const description = field(v.descripcion, 'Descripción', 2000, true);
        const content = field(v.contenido, 'Contenido del recurso', 30000, true);
        if (!['guia', 'test'].includes(String(v.tipo)))
            throw new InputError('Tipo inválido.');
        if (typeof v.publicado !== 'boolean')
            throw new InputError('Estado de publicación inválido.');
        if (!Array.isArray(v.preguntas) || v.preguntas.length > 12 || (v.tipo === 'test' && v.preguntas.length < 1))
            throw new InputError('Configura entre 1 y 12 preguntas para el test.');
        const questions = v.preguntas.map(q => field(q, 'Pregunta', 300, true));
        const id = update ? field(v.id, 'Recurso', 100, true)! : randomUUID();
        if (update) {
            const result = (await db().prepare('UPDATE lead_magnets SET titulo = ?, descripcion = ?, tipo = ?, contenido = ?, preguntas = ?, publicado = ? WHERE id = ? AND usuario_id = ?').run(title, description, String(v.tipo), content, JSON.stringify(questions), Number(v.publicado), id, user.id));
            if (!result.changes)
                return json({ error: 'Recurso no encontrado.' }, 404);
        }
        else
            (await db().prepare('INSERT INTO lead_magnets (id, usuario_id, titulo, descripcion, tipo, contenido, preguntas, publicado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, user.id, title, description, String(v.tipo), content, JSON.stringify(questions), Number(v.publicado)));
        return json(decode((await db().prepare('SELECT * FROM lead_magnets WHERE id = ? AND usuario_id = ?').get(id, user.id))!), update ? 200 : 201);
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(r: Request) { return save(r, false); }
export async function PUT(r: Request) { return save(r, true); }
