import { body, failure, json, sameOrigin } from '@/lib/api';
import { db } from '@/lib/db';
import { validConfirmation } from '@/lib/confirmation-token';
export async function POST(request:Request) {
 try {
  sameOrigin(request); const value=await body(request);
  if(typeof value.id!=='string'||value.id.length>100)return json({error:'Enlace inválido.'},400);
  const database=db(); await database.begin('confirmar/'+value.id);
  try {
   const row=await database.prepare('SELECT * FROM sesiones WHERE id=? FOR UPDATE').get(value.id);
   if(!row||row.estado_sesion!=='Programada'||Date.parse(String(row.fecha_hora))<=Date.now()||!validConfirmation(value.token,String(row.id),String(row.fecha_hora),String(row.modalidad),Number(row.duracion_minutos),Number(row.confirmacion_version))) {
    await database.exec('ROLLBACK'); return json({error:'El enlace ha vencido o la cita cambió. Contacta a tu profesional.'},400);
   }
   await database.prepare("UPDATE sesiones SET estado_confirmacion='confirmada',confirmada_en=COALESCE(confirmada_en,now()),confirmacion_fuente=COALESCE(confirmacion_fuente,'paciente') WHERE id=?").run(row.id);
   await database.exec('COMMIT'); return json({ok:true});
  }catch(e){await database.exec('ROLLBACK');throw e;}
 }catch(e){return failure(e);}
}
