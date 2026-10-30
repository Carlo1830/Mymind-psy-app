import { processAgendaQueue } from '../../database/agenda-worker.mjs';
import 'server-only';
import { requireAgendaSchema } from '@/lib/agenda-schema';
import { db } from '@/lib/db';
import { confirmationToken } from '@/lib/confirmation-token';
export function emailReady() { return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM); }
export async function sendAgendaEmail(input: { id:string; to:string; date:string; zone:string; modality:string; reminder:boolean; sessionId:string; duration:number; revision:number }) {
 if (!emailReady()) throw new Error('Email provider not configured');
 const date=new Date(input.date).toLocaleString('es-CL',{timeZone:input.zone,dateStyle:'long',timeStyle:'short'});
 const token=confirmationToken(input.sessionId,input.date,input.modality,input.duration,input.revision);
 const origin=process.env.APP_ORIGIN;
 const link=token&&origin ? new URL('/confirmar-cita',origin).toString()+'#'+new URLSearchParams({id:input.sessionId,token}) : null;
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',signal:AbortSignal.timeout(10000),
  headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'agenda/'+input.id},
  body:JSON.stringify({from:process.env.EMAIL_FROM,to:[input.to],subject:input.reminder?'Recordatorio de tu cita | EmNós':'Tu cita ha sido agendada | EmNós',
   text:(input.reminder?'Te recordamos tu cita: ':'Tu cita está agendada para: ')+date+'. Modalidad: '+input.modality+'.'+(link?' Confirma tu asistencia: '+link:'')+' Si necesitas realizar un cambio, contacta con tu profesional. EmNós.'})
 });
 if(!response.ok) throw new Error('Email provider rejected request ('+response.status+')');
 const result=await response.json();
 if(typeof result.id!=='string')throw new Error('Email provider returned no message ID');
 return result.id as string;
}
export async function processAgendaEmails() {
 if(!emailReady())return {configured:false,sent:0};
 await requireAgendaSchema();
 return processAgendaQueue({databaseFactory:db,send:sendAgendaEmail});
}
