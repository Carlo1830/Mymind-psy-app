import { requireUser } from '@/lib/auth';
import { db,patient } from '@/lib/db';
import { failure,json,sameOrigin } from '@/lib/api';
import { newAccessToken,tokenDigest } from '@/lib/booking-requests';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context) {
  try {
    const user=await requireUser();sameOrigin(request);const {id}=await context.params;
    const record=await patient(id,user.id);
    if (!record || record.status==='archived') return json({error:'Paciente activo no encontrado.'},404);
    const token=newAccessToken();
    const result=await db().prepare(`INSERT INTO mymind.accesos_paciente(paciente_id,usuario_id,token_hash,vence_en)
      VALUES(?,?,?,now()+interval '30 days') ON CONFLICT(paciente_id) DO UPDATE
      SET token_hash=EXCLUDED.token_hash,vence_en=EXCLUDED.vence_en,creado_en=now() RETURNING vence_en`).get(id,user.id,tokenDigest(token));
    return json({token,vence_en:result!.vence_en});
  } catch(error) { return failure(error); }
}
export async function DELETE(request:Request,context:Context) {
  try {
    const user=await requireUser();sameOrigin(request);const {id}=await context.params;
    if (!await patient(id,user.id)) return json({error:'Paciente no encontrado.'},404);
    await db().prepare('DELETE FROM mymind.accesos_paciente WHERE paciente_id=? AND usuario_id=?').run(id,user.id);
    return json({revocado:true});
  } catch(error) { return failure(error); }
}
