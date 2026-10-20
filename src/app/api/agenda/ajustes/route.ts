import { requireAgendaSchema } from '@/lib/agenda-schema';
import { requireUser } from '@/lib/auth';
import { body, failure, InputError, json, sameOrigin } from '@/lib/api';
import { db } from '@/lib/db';
import { emailReady } from '@/lib/agenda-email';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
 try{const user=await requireUser();await requireAgendaSchema();const settings=await db().prepare('SELECT sync_enabled,recordatorios_email,recordatorios_whatsapp,recordatorio_horas FROM usuarios WHERE id=?').get(user.id);
 return json({...settings,email_disponible:emailReady(),google_disponible:false,whatsapp_disponible:false});}catch(e){return failure(e);}
}
export async function PUT(request:Request){
 try{
  const user=await requireUser();sameOrigin(request);await requireAgendaSchema();const value=await body(request);
  if(typeof value.recordatorios_email!=='boolean'||typeof value.recordatorios_whatsapp!=='boolean'||!Number.isInteger(value.recordatorio_horas)||Number(value.recordatorio_horas)<1||Number(value.recordatorio_horas)>168)throw new InputError('Revisa las preferencias y la anticipación (1 a 168 horas).');
  if(value.recordatorios_email&&!emailReady())throw new InputError('Configura Resend y el remitente antes de activar los correos.');
  await db().prepare('UPDATE usuarios SET recordatorios_email=?,recordatorios_whatsapp=?,recordatorio_horas=? WHERE id=?').run(value.recordatorios_email,value.recordatorios_whatsapp,Number(value.recordatorio_horas),user.id);
  return json({guardado:true});
 }catch(e){return failure(e);}
}
