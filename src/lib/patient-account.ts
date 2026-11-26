import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes,createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { hashPassword,verifyPassword,rateLimit } from '@/lib/auth';
import { field,InputError } from '@/lib/api';
import { HttpError } from '@/lib/errors';

const cookieName='emnos_patient_session';
export const portalDigest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const portalToken=()=>randomBytes(32).toString('hex');
const dummy=`scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
export type PatientAccount={paciente_id:string;usuario_id:string;nombre_completo:string;profesional:string;email:string;fecha_nacimiento:string;version:number};
export const portalColumns='c.paciente_id,c.usuario_id,p.nombre_completo,u.nombre AS profesional,c.email,c.fecha_nacimiento::text,c.version';
export function portalEmail(value:unknown){const email=field(value,'E-mail',254,true)!.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new InputError('Informe um e-mail válido.');return email;}
export function adultBirth(value:unknown){
 const date=field(value,'Fecha de nacimiento',10,true)!;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new InputError('Fecha de nacimiento inválida.');
 const now=new Date();const [year,month,day]=date.split('-').map(Number);let age=now.getUTCFullYear()-year;
 if(now.getUTCMonth()+1<month||(now.getUTCMonth()+1===month&&now.getUTCDate()<day))age--;
 if(age<18||age>120)throw new InputError('Este portal está habilitado únicamente para mayores de 18 años.');return date;
}
export function portalPassword(value:unknown){if(typeof value!=='string'||value.length<12||value.length>128)throw new InputError('A senha deve ter entre 12 e 128 caracteres.');return value;}
export async function currentPatient():Promise<PatientAccount|null>{
 const token=(await cookies()).get(cookieName)?.value;if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 return (await db().prepare(`SELECT ${portalColumns} FROM mymind.portal_sesiones s
 JOIN mymind.portal_cuentas c ON c.paciente_id=s.paciente_id JOIN pacientes p ON p.id=c.paciente_id AND p.usuario_id=c.usuario_id
 JOIN usuarios u ON u.id=c.usuario_id WHERE s.token_hash=? AND s.vence_en>now() AND c.habilitado=true
 AND c.version=s.version_cuenta AND c.password_hash IS NOT NULL AND COALESCE(p.status,'active')='active' AND lower(trim(p.email))=c.email
 AND c.fecha_nacimiento<=current_date-interval '18 years'
 AND NOT EXISTS(SELECT 1 FROM mymind.fichas_atencion f WHERE f.paciente_id=c.paciente_id
  AND NULLIF(f.datos->>'fecha_nacimiento','')::date>current_date-interval '18 years')`).get(portalDigest(token)) as PatientAccount|undefined)||null;
}
export async function requirePatient(){const account=await currentPatient();if(!account)throw new HttpError(401,'Entre na sua conta de paciente para continuar.');return account;}
export async function portalEvent(patientId:string,actor:'profesional'|'paciente'|'sistema',action:string,resource?:string,database=db()){
 await database.prepare('INSERT INTO mymind.portal_eventos(paciente_id,actor,accion,recurso_id) VALUES(?,?,?,?)').run(patientId,actor,action,resource||null);
}
export async function endPatientSession(){const jar=await cookies();const token=jar.get(cookieName)?.value;if(token)await db().prepare('DELETE FROM mymind.portal_sesiones WHERE token_hash=?').run(portalDigest(token));jar.delete(cookieName);}
export async function startPatientSession(id:string,request:Request,expectedVersion:number){
 await endPatientSession();const token=portalToken();
 await db().prepare("DELETE FROM mymind.portal_sesiones WHERE vence_en<=now()").run();
 const inserted=await db().prepare(`INSERT INTO mymind.portal_sesiones(token_hash,paciente_id,vence_en,version_cuenta)
 SELECT ?,paciente_id,now()+interval '8 hours',version FROM mymind.portal_cuentas
 WHERE paciente_id=? AND habilitado=true AND version=? RETURNING paciente_id`).get(portalDigest(token),id,expectedVersion);
 if(!inserted)throw new HttpError(401,'Seu acesso mudou. Entre novamente.');
 const host=request.headers.get('host')||'';const local=/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
 (await cookies()).set(cookieName,token,{httpOnly:true,secure:!local||process.env.APP_ORIGIN?.startsWith('https://')===true,sameSite:'lax',path:'/',maxAge:28800});
}
export async function signInPatient(email:string,password:string,request:Request){
 await rateLimit('portal-login:'+email,15);await rateLimit('portal-login-global',150);
 const row=await db().prepare(`SELECT c.* FROM mymind.portal_cuentas c JOIN pacientes p ON p.id=c.paciente_id
  WHERE c.email=? AND lower(trim(p.email))=c.email AND COALESCE(p.status,'active')='active'`).get(email);
 const valid=await verifyPassword(password,String(row?.password_hash||dummy));
 if(!row||!valid||!row.habilitado)throw new HttpError(401,'E-mail ou senha incorretos, ou acesso indisponível.');
 await startPatientSession(String(row.paciente_id),request,Number(row.version));
 if(!await currentPatient()){await endPatientSession();throw new HttpError(401,'E-mail ou senha incorretos, ou acesso indisponível.');}
 await portalEvent(String(row.paciente_id),'paciente','inicio_sesion');
}
export async function consumePatientLink(value:Record<string,unknown>,type:'invitacion'|'recuperacion'){
 const email=portalEmail(value.email);const password=portalPassword(value.password);const token=field(value.token,'Enlace',64,true)!;
 if(!/^[a-f0-9]{64}$/.test(token))throw new InputError('Link inválido ou expirado.');
 if(type==='invitacion'&&value.consentimiento!==true)throw new InputError('Confirme a ativação da sua conta pessoal.');
 await rateLimit('portal-link:'+email,12);await rateLimit('portal-link-global',100);
 const row=await db().prepare('SELECT c.usuario_id FROM mymind.portal_enlaces e JOIN mymind.portal_cuentas c ON c.paciente_id=e.paciente_id WHERE e.token_hash=? AND e.tipo=?').get(portalDigest(token),type);
 if(!row)throw new InputError('Link inválido ou expirado. Solicite um novo à sua profissional.');
 const hashed=await hashPassword(password);const database=db();await database.begin(String(row.usuario_id));
 try{
  const grant=await database.prepare(`SELECT c.*,c.fecha_nacimiento::text AS fecha_nacimiento FROM mymind.portal_enlaces e JOIN mymind.portal_cuentas c ON c.paciente_id=e.paciente_id
   JOIN pacientes p ON p.id=c.paciente_id WHERE e.token_hash=? AND e.tipo=? AND e.vence_en>now()
   AND c.email=? AND lower(trim(p.email))=c.email AND c.habilitado=true AND COALESCE(p.status,'active')='active' FOR UPDATE OF c`).get(portalDigest(token),type,email);
  if(!grant||(type==='invitacion'&&grant.password_hash)||(type==='recuperacion'&&!grant.password_hash))throw new InputError('Link inválido ou expirado.');
  adultBirth(String(grant.fecha_nacimiento).slice(0,10));
  await database.prepare('DELETE FROM mymind.portal_enlaces WHERE paciente_id=?').run(grant.paciente_id);
  await database.prepare('DELETE FROM mymind.portal_sesiones WHERE paciente_id=?').run(grant.paciente_id);
  await database.prepare('DELETE FROM mymind.accesos_paciente WHERE paciente_id=?').run(grant.paciente_id);
  await database.prepare('UPDATE mymind.portal_cuentas SET password_hash=?,activado_en=COALESCE(activado_en,now()),version=version+1 WHERE paciente_id=?').run(hashed,grant.paciente_id);
  await portalEvent(String(grant.paciente_id),'paciente',type==='invitacion'?'cuenta_activada':'password_restablecida',undefined,database);
  await database.exec('COMMIT');
 }catch(error){await database.exec('ROLLBACK');throw error;}
}
export async function sendPortalLink(email:string,token:string,type:'invitacion'|'recuperacion'){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM||!process.env.APP_ORIGIN)return false;
 const url=new URL('/paciente/acceso',process.env.APP_ORIGIN);url.hash=new URLSearchParams({token,tipo:type}).toString();
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'portal/'+portalDigest(token)},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[email],subject:type==='invitacion'?'Ative sua conta | EmNós':'Redefina sua senha | EmNós',text:`${type==='invitacion'?'Sua profissional convidou você para ativar sua conta pessoal.':'Recebemos um pedido para redefinir sua senha.'}\n${url}\nEste link é de uso único e expira em ${type==='invitacion'?'48 horas':'30 minutos'}. Se você não reconhece este pedido, ignore a mensagem.`})});
  return response.ok&&typeof (await response.json()).id==='string';
 }catch{return false;}
}
