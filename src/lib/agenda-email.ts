import 'server-only';
import { requireAgendaSchema } from '@/lib/agenda-schema';
import { db } from '@/lib/db';
export function emailReady() { return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM); }
export async function sendAgendaEmail(input: { id:string; to:string; date:string; zone:string; modality:string; reminder:boolean }) {
 if (!emailReady()) throw new Error('Email provider not configured');
 const date=new Date(input.date).toLocaleString('es-CL',{timeZone:input.zone,dateStyle:'long',timeStyle:'short'});
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',signal:AbortSignal.timeout(10000),
  headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'agenda/'+input.id},
  body:JSON.stringify({from:process.env.EMAIL_FROM,to:[input.to],subject:input.reminder?'Recordatorio de tu cita | EmNós':'Tu cita ha sido agendada | EmNós',
   text:(input.reminder?'Te recordamos tu cita: ':'Tu cita está agendada para: ')+date+'. Modalidad: '+input.modality+'. Si necesitas realizar un cambio, contacta con tu profesional. EmNós.'})
 });
 if(!response.ok) throw new Error('Email provider rejected request');
}
export async function processAgendaEmails() {
 if(!emailReady()) return {configured:false,sent:0};
 await requireAgendaSchema();
 let sent=0;
 for(let i=0;i<10;i++){
  const database=db(); await database.begin('agenda-email-worker');
  try{
   const job=await database.prepare("SELECT j.*, s.estado_sesion, s.fecha_hora, s.modalidad AS actual_modalidad, p.email AS actual_email, u.recordatorios_email FROM mymind.agenda_emails j JOIN sesiones s ON s.id=j.sesion_id JOIN pacientes p ON p.id=s.paciente_id JOIN usuarios u ON u.id=p.usuario_id WHERE j.estado='pendiente' AND j.enviar_en<=now() ORDER BY j.enviar_en,j.id LIMIT 1 FOR UPDATE OF j,s,p,u").get();
   if(!job){await database.exec('COMMIT');break;}
   if(!job.recordatorios_email || job.estado_sesion!=='Programada' || job.fecha_cita!==job.fecha_hora || job.destinatario!==job.actual_email || job.modalidad!==job.actual_modalidad || Date.parse(String(job.fecha_cita))<=Date.now()){
    await database.prepare("UPDATE mymind.agenda_emails SET estado='omitido' WHERE id=?").run(job.id);
   }else if(Date.now()-Date.parse(String(job.enviar_en))>23*3600000){
    await database.prepare("UPDATE mymind.agenda_emails SET estado='fallido' WHERE id=?").run(job.id);
   }else{
    try{
     await sendAgendaEmail({id:String(job.id),to:String(job.destinatario),date:String(job.fecha_cita),zone:String(job.zona_horaria),modality:String(job.modalidad),reminder:job.tipo==='recordatorio'});
     await database.prepare("UPDATE mymind.agenda_emails SET estado='enviado',enviado_en=now(),intentos=intentos+1 WHERE id=?").run(job.id);
     if(job.tipo==='recordatorio') await database.prepare("UPDATE sesiones SET estado_confirmacion='recordatorio_enviado' WHERE id=? AND estado_confirmacion<>'cancelada'").run(job.sesion_id);
     sent++;
    }catch{
     await database.prepare("UPDATE mymind.agenda_emails SET intentos=intentos+1,estado='fallido' WHERE id=?").run(job.id);
    }
   }
   await database.exec('COMMIT');
  }catch(error){await database.exec('ROLLBACK');throw error;}
 }
 return {configured:true,sent};
}
