import { failure,json } from '@/lib/api';
import { db } from '@/lib/db';
import { verifyEmailWebhook } from '@/lib/email-webhook';
export async function POST(request:Request){
 const secret=process.env.RESEND_WEBHOOK_SECRET;
 if(!secret)return json({error:'Webhook no configurado.'},503);
 const raw=await request.text();
 if(raw.length>100000)return json({error:'Solicitud demasiado grande.'},413);
 if(!verifyEmailWebhook(raw,request.headers,secret))return json({error:'Firma inválida.'},401);
 try{
  const event=JSON.parse(raw);
  const state:Record<string,string>={'email.delivered':'entregado','email.bounced':'rebotado','email.complained':'queja'};
  const delivery=state[event.type];const at=Date.parse(event.created_at);
  if(delivery&&typeof event.data?.email_id==='string'&&Number.isFinite(at)) {
   const result=await db().prepare("UPDATE mymind.agenda_emails SET entrega=?,entrega_en=? WHERE proveedor_id=? AND (entrega_en IS NULL OR entrega_en<=?::timestamptz) AND NOT(entrega IN ('rebotado','queja') AND ?='entregado')").run(delivery,new Date(at).toISOString(),event.data.email_id,new Date(at).toISOString(),delivery);
   if(!result.changes && !await db().prepare('SELECT id FROM mymind.agenda_emails WHERE proveedor_id=?').get(event.data.email_id)) return json({error:'La aceptación aún no está registrada; reintentar evento.'},503);
  }
  return json({ok:true});
 }catch(e){return failure(e);}
}
