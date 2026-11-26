import { randomUUID } from 'node:crypto';
import { requirePatient,portalEvent } from '@/lib/patient-account';
import { rateLimit } from '@/lib/auth';
import { db } from '@/lib/db';
import { body,field,failure,json,sameOrigin,InputError } from '@/lib/api';
import { HttpError } from '@/lib/errors';
import { patientFields } from '@/types/patient-portal';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{
 const a=await requirePatient();const d=db();
 const ficha=await d.prepare('SELECT datos,version,actualizado_en FROM mymind.portal_fichas WHERE paciente_id=?').get(a.paciente_id)||null;
 const documentos=await d.prepare('SELECT id,titulo,tipo,contenido,creado_en FROM mymind.portal_documentos WHERE paciente_id=? AND usuario_id=? AND publicado=true ORDER BY creado_en DESC LIMIT 100').all(a.paciente_id,a.usuario_id);
 const peticiones=await d.prepare('SELECT id,tipo,texto,respuesta,creado_en,respondido_en FROM mymind.portal_peticiones WHERE paciente_id=? AND usuario_id=? ORDER BY creado_en DESC LIMIT 100').all(a.paciente_id,a.usuario_id);
 const citas=await d.prepare('SELECT id,fecha_hora,duracion_minutos,modalidad,estado_sesion FROM sesiones WHERE paciente_id=? ORDER BY fecha_hora DESC LIMIT 100').all(a.paciente_id);
 return json({nombre:a.nombre_completo,email:a.email,fecha_nacimiento:a.fecha_nacimiento,profesional:a.profesional,ficha,documentos,peticiones,citas});
 }catch(error){return failure(error);}}
export async function POST(request:Request){try{
 sameOrigin(request);const a=await requirePatient();const value=await body(request);
 if(value.accion==='peticion')await rateLimit('portal-petition:'+a.paciente_id,10,86400000);
 const d=db();await d.begin(a.usuario_id);try{
  // Recheck revocation inside the professional's transaction lock.
  const active=await d.prepare("SELECT c.paciente_id FROM mymind.portal_cuentas c JOIN pacientes p ON p.id=c.paciente_id WHERE c.paciente_id=? AND c.version=? AND c.habilitado=true AND lower(trim(p.email))=c.email AND COALESCE(p.status,'active')='active'").get(a.paciente_id,a.version);
  if(!active)throw new HttpError(401,'Seu acesso não está disponível.');
  if(value.accion==='guardar'){
   if(typeof value.version!=='number'||!Number.isSafeInteger(value.version)||value.version<0)throw new InputError('Versão inválida.');
   const prior=await d.prepare('SELECT version FROM mymind.portal_fichas WHERE paciente_id=? FOR UPDATE').get(a.paciente_id);
   if(Number(prior?.version||0)!==value.version)throw new HttpError(409,'Sua ficha foi atualizada em outra janela. Recarregue antes de salvar.');
   if(!value.datos||typeof value.datos!=='object'||Array.isArray(value.datos))throw new InputError('Dados inválidos.');
   const data:Record<string,string>={};for(const key of Object.keys(patientFields))data[key]=field((value.datos as Record<string,unknown>)[key],patientFields[key as keyof typeof patientFields],key==='antecedentes'?5000:300)||'';
   await d.prepare('INSERT INTO mymind.portal_fichas(paciente_id,datos) VALUES(?,?::jsonb) ON CONFLICT(paciente_id) DO UPDATE SET datos=EXCLUDED.datos,version=mymind.portal_fichas.version+1,actualizado_en=now()').run(a.paciente_id,JSON.stringify(data));
   await portalEvent(a.paciente_id,'paciente','ficha_actualizada',undefined,d);
  }else if(value.accion==='peticion'){
   if(!['acceso_prontuario','correccion'].includes(String(value.tipo)))throw new InputError('Tipo inválido.');
   const text=field(value.texto,'Pedido',3000,true)!;const id=randomUUID();await d.prepare('INSERT INTO mymind.portal_peticiones(id,paciente_id,usuario_id,tipo,texto) VALUES(?,?,?,?,?)').run(id,a.paciente_id,a.usuario_id,String(value.tipo),text);await portalEvent(a.paciente_id,'paciente','peticion_creada',id,d);
  }else throw new InputError('Ação inválida.');
  await d.exec('COMMIT');return json({ok:true});
 }catch(error){await d.exec('ROLLBACK');throw error;}
 }catch(error){return failure(error);}}
