import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure,json } from '@/lib/api';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{const user=await requireUser();const items=await db().prepare(`SELECT r.id,r.paciente_id,r.tipo,r.creado_en,p.nombre_completo
 FROM mymind.portal_peticiones r JOIN mymind.pacientes p ON p.id=r.paciente_id
 WHERE r.usuario_id=? AND r.respondido_en IS NULL ORDER BY r.creado_en LIMIT 100`).all(user.id);return json(items);}catch(error){return failure(error);}}
