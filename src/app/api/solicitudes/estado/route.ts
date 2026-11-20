import { db } from '@/lib/db';
import { failure,json } from '@/lib/api';
import { tokenDigest,expireRequests,requestColumns } from '@/lib/booking-requests';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {
    const token=request.headers.get('x-request-token')||'';
    if (!/^[a-f0-9]{64}$/.test(token)) return json({error:'Enlace de seguimiento inválido.'},401);
    const record=await db().prepare('SELECT id,usuario_id FROM mymind.solicitudes_cita WHERE seguimiento_hash=?').get(tokenDigest(token));
    if (!record) return json({error:'Solicitud no encontrada.'},404);
    await expireRequests(String(record.usuario_id));
    return json(await db().prepare(`SELECT ${requestColumns} FROM mymind.solicitudes_cita r WHERE r.id=?`).get(record.id));
  } catch(error) { return failure(error); }
}
