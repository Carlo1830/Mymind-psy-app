import { body,field,failure,json,sameOrigin,InputError } from '@/lib/api';
import { db } from '@/lib/db';
import { rateLimit,hashPassword,verifyPassword } from '@/lib/auth';
import { currentPatient,requirePatient,signInPatient,endPatientSession,startPatientSession,consumePatientLink,portalEmail,portalPassword,portalToken,portalDigest,portalEvent,sendPortalLink } from '@/lib/patient-account';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{action:string}>};
export async function GET(_request:Request,context:Context){try{if((await context.params).action!=='me')return json({error:'Não encontrado.'},404);const account=await currentPatient();return json({paciente:account?{nombre:account.nombre_completo,email:account.email,profesional:account.profesional}:null});}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){
 try{
  sameOrigin(request);const {action}=await context.params;
  if(action==='logout'){await endPatientSession();return json({ok:true});}
  const value=await body(request);
  if(action==='login'){
   await signInPatient(portalEmail(value.email),portalPassword(value.password),request);return json({ok:true});
  }
  if(action==='activate'||action==='reset'){
   await consumePatientLink(value,action==='activate'?'invitacion':'recuperacion');await endPatientSession();return json({ok:true});
  }
  if(action==='forgot'){
   const email=portalEmail(value.email);await rateLimit('portal-recovery:'+email,3,3600000);await rateLimit('portal-recovery-global',30,3600000);
   // Same response for unknown, inactive and disabled accounts. Tokens never leave this endpoint.
   if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM||!process.env.APP_ORIGIN)return json({error:'O envio de e-mail ainda não está disponível. Peça à sua profissional um link individual de recuperação.'},503);
   const found=await db().prepare(`SELECT c.paciente_id,c.usuario_id FROM mymind.portal_cuentas c JOIN pacientes p ON p.id=c.paciente_id
    WHERE c.email=? AND c.habilitado=true AND c.password_hash IS NOT NULL AND lower(trim(p.email))=c.email AND COALESCE(p.status,'active')='active'`).get(email);
   if(found){const token=portalToken();const d=db();await d.begin(String(found.usuario_id));try{
    const active=await d.prepare('SELECT paciente_id FROM mymind.portal_cuentas WHERE paciente_id=? AND habilitado=true AND email=? FOR UPDATE').get(found.paciente_id,email);
    if(active){await d.prepare("INSERT INTO mymind.portal_enlaces(token_hash,paciente_id,tipo,vence_en) VALUES(?,?,'recuperacion',now()+interval '30 minutes') ON CONFLICT(paciente_id,tipo) DO UPDATE SET token_hash=EXCLUDED.token_hash,vence_en=EXCLUDED.vence_en").run(portalDigest(token),found.paciente_id);}
    await d.exec('COMMIT');if(active)await sendPortalLink(email,token,'recuperacion');
   }catch(error){await d.exec('ROLLBACK');throw error;}}
   return json({ok:true,mensaje:'Se houver uma conta ativa para este e-mail, você receberá as instruções. Se não chegarem, fale com sua profissional.'});
  }
  if(action==='password'){
   const account=await requirePatient();const password=portalPassword(value.password);const current=field(value.actual,'Senha atual',128,true)!;
   await rateLimit('portal-change:'+account.paciente_id,8);
   const d=db();await d.begin(account.usuario_id);try{
    const row=await d.prepare('SELECT password_hash FROM mymind.portal_cuentas WHERE paciente_id=? AND habilitado=true FOR UPDATE').get(account.paciente_id);
    if(!row||!await verifyPassword(current,String(row.password_hash)))throw new InputError('A senha atual está incorreta.');
    await d.prepare('UPDATE mymind.portal_cuentas SET password_hash=?,version=version+1 WHERE paciente_id=?').run(await hashPassword(password),account.paciente_id);
    await d.prepare('DELETE FROM mymind.portal_sesiones WHERE paciente_id=?').run(account.paciente_id);
    await d.prepare('DELETE FROM mymind.portal_enlaces WHERE paciente_id=?').run(account.paciente_id);
    await portalEvent(account.paciente_id,'paciente','password_alterada',undefined,d);await d.exec('COMMIT');
   }catch(error){await d.exec('ROLLBACK');throw error;}
   await startPatientSession(account.paciente_id,request,account.version+1);return json({ok:true});
  }
  return json({error:'Não encontrado.'},404);
 }catch(error){return failure(error);}
}
