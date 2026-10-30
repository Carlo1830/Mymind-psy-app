import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure,json } from '@/lib/api';
export async function GET(){try{const user=await requireUser();return json(await db().prepare('SELECT j.id,j.sesion_id,j.tipo,j.estado,j.entrega,j.intentos,j.enviar_en,j.enviado_en,j.entrega_en,j.ultimo_error,p.nombre_completo FROM mymind.agenda_emails j JOIN sesiones s ON s.id=j.sesion_id JOIN pacientes p ON p.id=s.paciente_id WHERE j.usuario_id=? AND p.usuario_id=? ORDER BY j.creado_en DESC LIMIT 50').all(user.id,user.id));}catch(e){return failure(e);}}
