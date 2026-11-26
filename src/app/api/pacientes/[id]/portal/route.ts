import { randomUUID } from 'node:crypto';
import { requireUser } from '@/lib/auth';
import { db,patient } from '@/lib/db';
import { body,field,failure,json,sameOrigin,InputError } from '@/lib/api';
import { HttpError } from '@/lib/errors';
import { adultBirth,portalDigest,portalToken,portalEmail,portalEvent,sendPortalLink } from '@/lib/patient-account';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context){try{
 const user=await requireUser();const {id}=await context.params;if(!await patient(id,user.id))throw new HttpError(404,'Paciente no encontrado.');const d=db();
 const cuenta=await d.prepare('SELECT email,fecha_nacimiento::text,habilitado,activado_en,version FROM mymind.portal_cuentas WHERE paciente_id=? AND usuario_id=?').get(id,user.id)||null;
 const ficha=await d.prepare('SELECT datos,version,actualizado_en FROM mymind.portal_fichas WHERE paciente_id=?').get(id)||null;
 const documentos=await d.prepare('SELECT id,titulo,tipo,contenido,publicado,creado_en FROM mymind.portal_documentos WHERE paciente_id=? AND usuario_id=? ORDER BY creado_en DESC LIMIT 100').all(id,user.id);
 const peticiones=await d.prepare('SELECT id,tipo,texto,respuesta,creado_en,respondido_en FROM mymind.portal_peticiones WHERE paciente_id=? AND usuario_id=? ORDER BY creado_en DESC LIMIT 100').all(id,user.id);
 const eventos=await d.prepare('SELECT actor,accion,recurso_id,creado_en FROM mymind.portal_eventos WHERE paciente_id=? ORDER BY id DESC LIMIT 30').all(id);
 const clinical=await d.prepare("SELECT datos->>'fecha_nacimiento' AS fecha FROM mymind.fichas_atencion WHERE paciente_id=? AND usuario_id=?").get(id,user.id);
 return json({cuenta,ficha,documentos,peticiones,eventos,fecha_clinica:clinical?.fecha||null,correo_disponible:!!(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM&&process.env.APP_ORIGIN)});
 }catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){try{
 const user=await requireUser();sameOrigin(request);const {id}=await context.params;const value=await body(request);const d=db();let token='';let email='';let linkType:'invitacion'|'recuperacion'='invitacion';
 await d.begin(user.id);try{
  const p=await d.prepare('SELECT id,email,status FROM pacientes WHERE id=? AND usuario_id=? FOR UPDATE').get(id,user.id);
  if(!p||p.status==='archived')throw new HttpError(404,'Paciente activo no encontrado.');
  const account=await d.prepare('SELECT *,fecha_nacimiento::text AS fecha_nacimiento FROM mymind.portal_cuentas WHERE paciente_id=? FOR UPDATE').get(id);
  switch(value.accion){
   case 'invitar':{
    if(value.adulto!==true)throw new InputError('Confirma que habilitas a un paciente adulto.');email=portalEmail(p.email);const birth=adultBirth(value.fecha_nacimiento);
    const known=await d.prepare("SELECT datos->>'fecha_nacimiento' AS fecha FROM mymind.fichas_atencion WHERE paciente_id=?").get(id);
    if(known?.fecha){adultBirth(known.fecha);if(known.fecha!==birth)throw new InputError('La fecha no coincide con la ficha clínica. Corrígela antes de invitar.');}
    if(account?.password_hash&&account.habilitado)throw new InputError('La cuenta ya está activada. Usa recuperación, o revócala antes de crear una nueva invitación.');
    const duplicate=await d.prepare('SELECT paciente_id FROM mymind.portal_cuentas WHERE email=? AND paciente_id<>?').get(email,id);
    if(duplicate)throw new InputError('Ese correo ya tiene una cuenta. Revisa si hay una ficha duplicada.');
    await d.prepare('INSERT INTO mymind.portal_cuentas(paciente_id,usuario_id,email,fecha_nacimiento) VALUES(?,?,?,?) ON CONFLICT(paciente_id) DO UPDATE SET email=EXCLUDED.email,fecha_nacimiento=EXCLUDED.fecha_nacimiento,habilitado=true,password_hash=NULL,activado_en=NULL,version=mymind.portal_cuentas.version+1').run(id,user.id,email,birth);
    await d.prepare('DELETE FROM mymind.portal_sesiones WHERE paciente_id=?').run(id);
    await d.prepare('DELETE FROM mymind.portal_enlaces WHERE paciente_id=?').run(id);
    token=portalToken();await d.prepare("INSERT INTO mymind.portal_enlaces(token_hash,paciente_id,tipo,vence_en) VALUES(?,?,'invitacion',now()+interval '48 hours') ON CONFLICT(paciente_id,tipo) DO UPDATE SET token_hash=EXCLUDED.token_hash,vence_en=EXCLUDED.vence_en").run(portalDigest(token),id);
    await portalEvent(id,'profesional','invitacion_creada',undefined,d);break;
   }
   case 'recuperar':{
    if(!account?.password_hash||!account.habilitado)throw new InputError('La cuenta debe estar activa y habilitada.');
    email=portalEmail(p.email);if(email!==account.email)throw new InputError('El correo no coincide con la cuenta. Revisa la identidad y el correo con el paciente.');
    linkType='recuperacion';token=portalToken();await d.prepare("INSERT INTO mymind.portal_enlaces(token_hash,paciente_id,tipo,vence_en) VALUES(?,?,'recuperacion',now()+interval '30 minutes') ON CONFLICT(paciente_id,tipo) DO UPDATE SET token_hash=EXCLUDED.token_hash,vence_en=EXCLUDED.vence_en").run(portalDigest(token),id);
    await portalEvent(id,'profesional','recuperacion_creada',undefined,d);break;
   }
   case 'revocar':
    await d.prepare('UPDATE mymind.portal_cuentas SET habilitado=false,version=version+1 WHERE paciente_id=?').run(id);
    await d.prepare('DELETE FROM mymind.portal_sesiones WHERE paciente_id=?').run(id);await d.prepare('DELETE FROM mymind.portal_enlaces WHERE paciente_id=?').run(id);
    await d.prepare('DELETE FROM mymind.accesos_paciente WHERE paciente_id=?').run(id);await portalEvent(id,'profesional','acceso_revocado',undefined,d);break;
   case 'habilitar':
    if(!account||!account.password_hash||account.email!==portalEmail(p.email))throw new InputError('Revisa la cuenta y el correo con el paciente.');
    if(value.adulto!==true)throw new InputError('Confirma que habilitas a un paciente adulto.');
    adultBirth(String(account.fecha_nacimiento).slice(0,10));
    await d.prepare('UPDATE mymind.portal_cuentas SET habilitado=true,version=version+1 WHERE paciente_id=?').run(id);await portalEvent(id,'profesional','acceso_habilitado',undefined,d);break;
   case 'documento':{
    if(!account)throw new InputError('Habilita primero el portal del paciente.');const title=field(value.titulo,'Título',200,true)!;const content=field(value.contenido,'Contenido',50000,true)!;
    if(!['indicaciones','consentimiento','prontuario','informe','comprobante'].includes(String(value.tipo)))throw new InputError('Tipo de documento inválido.');
    if(value.confirmar!==true)throw new InputError('Confirma que el documento está preparado para el paciente.');
    const documentId=randomUUID();await d.prepare('INSERT INTO mymind.portal_documentos(id,paciente_id,usuario_id,titulo,tipo,contenido) VALUES(?,?,?,?,?,?)').run(documentId,id,user.id,title,String(value.tipo),content);
    await portalEvent(id,'profesional','documento_publicado',documentId,d);break;
   }
   case 'retirar_documento':{
    const documentId=field(value.id,'Documento',100,true)!;const updated=await d.prepare('UPDATE mymind.portal_documentos SET publicado=false WHERE id=? AND paciente_id=? AND usuario_id=? RETURNING id').get(documentId,id,user.id);if(!updated)throw new HttpError(404,'Documento no encontrado.');await portalEvent(id,'profesional','documento_retirado',documentId,d);break;
   }
   case 'responder':{
    const petition=field(value.id,'Petición',100,true)!;const response=field(value.respuesta,'Respuesta',3000,true)!;
    const updated=await d.prepare('UPDATE mymind.portal_peticiones SET respuesta=?,respondido_en=now() WHERE id=? AND paciente_id=? AND usuario_id=? AND respondido_en IS NULL RETURNING id').get(response,petition,id,user.id);if(!updated)throw new HttpError(409,'La petición ya fue respondida o no existe.');await portalEvent(id,'profesional','peticion_respondida',petition,d);break;
   }
   default:throw new InputError('Acción inválida.');
  }
  await d.exec('COMMIT');
 }catch(error){await d.exec('ROLLBACK');throw error;}
 if(token)return json({token,tipo:linkType,correo_aceptado:await sendPortalLink(email,token,linkType)});
 return json({ok:true});
 }catch(error){return failure(error);}}
