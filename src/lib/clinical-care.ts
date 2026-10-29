import 'server-only';
import { randomUUID } from 'node:crypto';
import { db,patient } from '@/lib/db';
import { field,InputError } from '@/lib/api';
import { assertNoOverlap } from '@/lib/booking';
import { HttpError } from '@/lib/errors';
import { profileLabels,noteLabels,type NoteContent } from '@/types/clinical-care';
const conflict=()=>new HttpError(409,'Este registro cambió en otra ventana. Tu texto se conserva: revisa la versión actual antes de continuar.');
function version(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new InputError('Versión inválida.');return value;}
function identifier(value:unknown){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw new InputError('Identificador inválido.');return value;}
function dateOnly(value:unknown,label:string){const s=field(value,label,10);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s))throw new InputError(label+' inválida.');return s;}
function content(value:unknown):NoteContent{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('Contenido inválido.');
 const result={} as NoteContent;
 for(const key of Object.keys(noteLabels) as (keyof NoteContent)[]){result[key]=field((value as Record<string,unknown>)[key],noteLabels[key],10000)||'';}
 return result;
}
async function ensurePatient(id:string,owner:string){if(!await patient(id,owner))throw new HttpError(404,'Paciente no encontrado.');}
export async function careState(id:string,owner:string,noteId:string|null){
 await ensurePatient(id,owner);const d=db();
 if(noteId){
  const nota=await d.prepare('SELECT n.*,s.fecha_hora,u.nombre AS autor FROM mymind.notas_clinicas n JOIN mymind.sesiones s ON s.id=n.sesion_id JOIN mymind.usuarios u ON u.id=n.actualizado_por WHERE n.id=? AND n.paciente_id=? AND n.usuario_id=?').get(noteId,id,owner);
  if(!nota)throw new HttpError(404,'Nota no encontrada.');
  const revisiones=await d.prepare('SELECT r.version,r.contenido,r.estado,r.registrado_en,u.nombre AS autor FROM mymind.nota_revisiones r JOIN mymind.usuarios u ON u.id=r.autor_id WHERE r.nota_id=? ORDER BY r.version DESC').all(noteId);
  const adendas=await d.prepare('SELECT a.id,a.texto,a.registrado_en,u.nombre AS autor FROM mymind.nota_adendas a JOIN mymind.usuarios u ON u.id=a.autor_id WHERE a.nota_id=? ORDER BY a.registrado_en,a.id').all(noteId);
  return {nota,revisiones,adendas};
 }
 const ficha=await d.prepare('SELECT f.datos,f.version,f.actualizado_en,u.nombre AS autor FROM mymind.fichas_atencion f JOIN mymind.usuarios u ON u.id=f.actualizado_por WHERE f.paciente_id=? AND f.usuario_id=?').get(id,owner)||null;
 const objetivos=await d.prepare('SELECT o.*,o.fecha_revision::text AS fecha_revision,u.nombre AS autor FROM mymind.objetivos_terapeuticos o JOIN mymind.usuarios u ON u.id=o.actualizado_por WHERE o.paciente_id=? AND o.usuario_id=? ORDER BY o.creado_en,o.id').all(id,owner);
 const notas=await d.prepare('SELECT n.id,n.sesion_id,n.estado,n.version,n.actualizado_en,n.finalizada_en,s.fecha_hora,u.nombre AS autor FROM mymind.notas_clinicas n JOIN mymind.sesiones s ON s.id=n.sesion_id JOIN mymind.usuarios u ON u.id=n.actualizado_por WHERE n.paciente_id=? AND n.usuario_id=? ORDER BY s.fecha_hora DESC,n.id').all(id,owner);
 const eventos=await d.prepare('SELECT e.id,e.accion,e.recurso_id,e.version,e.registrado_en,u.nombre AS autor FROM mymind.atencion_eventos e JOIN mymind.usuarios u ON u.id=e.actor_id WHERE e.paciente_id=? AND e.usuario_id=? ORDER BY e.id DESC LIMIT 100').all(id,owner);
 return {ficha,objetivos,notas,eventos};
}
export async function mutateCare(id:string,owner:string,value:Record<string,unknown>){
 const d=db();await d.begin(owner);
 try{
  if(!await d.prepare('SELECT id FROM mymind.pacientes WHERE id=? AND usuario_id=? FOR UPDATE').get(id,owner))throw new HttpError(404,'Paciente no encontrado.');
  let result:Record<string,unknown>|undefined;let action='';let resource=id;let revision:number|null=null;
  if(value.accion==='ficha_guardar'){
   const current=await d.prepare('SELECT version FROM mymind.fichas_atencion WHERE paciente_id=? AND usuario_id=?').get(id,owner);
   if(version(value.version)!==Number(current?.version||0))throw conflict();
   const raw=value.datos;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new InputError('Ficha inválida.');
   const datos:Record<string,string>={};for(const key of Object.keys(profileLabels)){datos[key]=field((raw as Record<string,unknown>)[key],profileLabels[key as keyof typeof profileLabels],200)||'';}
   const birth=dateOnly(datos.fecha_nacimiento,'Fecha de nacimiento');if(birth&&birth>new Date().toISOString().slice(0,10))throw new InputError('La fecha de nacimiento no puede ser futura.');
   result=await d.prepare('INSERT INTO mymind.fichas_atencion(paciente_id,usuario_id,datos,actualizado_por) VALUES(?,?,?::jsonb,?) ON CONFLICT(paciente_id) DO UPDATE SET datos=EXCLUDED.datos,version=mymind.fichas_atencion.version+1,actualizado_por=EXCLUDED.actualizado_por,actualizado_en=now() RETURNING *').get(id,owner,JSON.stringify(datos),owner);action='ficha_actualizada';
  }else if(value.accion==='objetivo_guardar'){
   resource=identifier(value.id);const current=await d.prepare('SELECT * FROM mymind.objetivos_terapeuticos WHERE id=?').get(resource);
   if(current&&(current.paciente_id!==id||current.usuario_id!==owner))throw new HttpError(404,'Objetivo no encontrado.');
   if(version(value.version)!==Number(current?.version||0))throw conflict();
   const title=field(value.titulo,'Objetivo',300,true);const description=field(value.descripcion,'Descripción',3000);const criterion=field(value.criterio_logro,'Criterio de logro',3000);const date=dateOnly(value.fecha_revision,'Fecha de revisión');
   if(!['activo','logrado','pausado'].includes(String(value.estado)))throw new InputError('Estado de objetivo inválido.');
   result=await d.prepare('INSERT INTO mymind.objetivos_terapeuticos(id,paciente_id,usuario_id,titulo,descripcion,criterio_logro,estado,fecha_revision,actualizado_por) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET titulo=EXCLUDED.titulo,descripcion=EXCLUDED.descripcion,criterio_logro=EXCLUDED.criterio_logro,estado=EXCLUDED.estado,fecha_revision=EXCLUDED.fecha_revision,version=mymind.objetivos_terapeuticos.version+1,actualizado_en=now(),actualizado_por=EXCLUDED.actualizado_por RETURNING *').get(resource,id,owner,title,description,criterion,String(value.estado),date,owner);action=current?'objetivo_actualizado':'objetivo_creado';
  }else if(value.accion==='nota_crear'){
   resource=identifier(value.id);
   const existing=await d.prepare('SELECT * FROM mymind.notas_clinicas WHERE id=?').get(resource);
   if(existing){if(existing.usuario_id!==owner||existing.paciente_id!==id)throw new HttpError(404,'Nota no encontrada.');if(value.sesion_id&&value.sesion_id!==existing.sesion_id)throw conflict();await d.exec('COMMIT');return existing;}
   let session=field(value.sesion_id,'Sesión',100);
   if(!session){
    const date=field(value.fecha_hora,'Fecha de sesión',40,true)!;if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString()!==date||Date.parse(date)>Date.now())throw new InputError('Indica una fecha válida y no futura para la sesión realizada.');
    if(!['Presencial','Online'].includes(String(value.modalidad)))throw new InputError('Modalidad inválida.');
    await assertNoOverlap(owner,date,50,'',d);
    session=randomUUID();await d.prepare("INSERT INTO mymind.sesiones(id,paciente_id,fecha_hora,estado_sesion,modalidad) VALUES(?,?,?,'Realizada',?)").run(session,id,date,String(value.modalidad));
   }
   const s=await d.prepare('SELECT * FROM mymind.sesiones WHERE id=? AND paciente_id=? FOR UPDATE').get(session,id);
   if(!s)throw new HttpError(404,'Sesión no encontrada.');if(s.estado_sesion==='Cancelada')throw new InputError('No se puede iniciar una nota en una sesión cancelada.');
   if(await d.prepare('SELECT id FROM mymind.notas_clinicas WHERE sesion_id=?').get(session))throw new HttpError(409,'Esta sesión ya tiene una nota. Ábrela desde el listado.');
   result=await d.prepare('INSERT INTO mymind.notas_clinicas(id,paciente_id,usuario_id,sesion_id,contenido,creado_por,actualizado_por) VALUES(?,?,?,?,?::jsonb,?,?) RETURNING *').get(resource,id,owner,session,JSON.stringify(content({})),owner,owner);action='nota_creada';
  }else if(['nota_guardar','nota_finalizar','adenda_crear'].includes(String(value.accion))){
   resource=identifier(value.id);const note=await d.prepare('SELECT * FROM mymind.notas_clinicas WHERE id=? AND paciente_id=? AND usuario_id=? FOR UPDATE').get(resource,id,owner);
   if(!note)throw new HttpError(404,'Nota no encontrada.');
   if(value.accion==='adenda_crear'){
    if(note.estado!=='finalizada')throw new InputError('Las adendas se añaden a notas finalizadas.');
    const addendumId=identifier(value.adenda_id);const text=field(value.texto,'Adenda',10000,true);
    const previous=await d.prepare('SELECT * FROM mymind.nota_adendas WHERE id=?').get(addendumId);
    if(previous){if(previous.nota_id!==resource||previous.autor_id!==owner)throw new HttpError(404,'Adenda no encontrada.');if(previous.texto!==text)throw conflict();await d.exec('COMMIT');return previous;}
    result=await d.prepare('INSERT INTO mymind.nota_adendas(id,nota_id,texto,autor_id) VALUES(?,?,?,?) RETURNING *').get(addendumId,resource,text,owner);action='adenda_agregada';
   }else{
    if(note.estado!=='borrador')throw new HttpError(409,'La nota está finalizada. Añade una adenda para corregirla.');
    if(version(value.version)!==note.version)throw conflict();
    if(value.accion==='nota_guardar'){
     result=await d.prepare('UPDATE mymind.notas_clinicas SET contenido=?::jsonb,actualizado_por=? WHERE id=? RETURNING *').get(JSON.stringify(content(value.contenido)),owner,resource);action='borrador_guardado';
    }else{
     if(!content(note.contenido).resumen.trim())throw new InputError('Completa y guarda el resumen antes de finalizar.');
     const session=await d.prepare('SELECT * FROM mymind.sesiones WHERE id=? AND paciente_id=? FOR UPDATE').get(note.sesion_id,id);
     if(!session||session.estado_sesion==='Cancelada'||Date.parse(String(session.fecha_hora))>Date.now())throw new InputError('Solo se finalizan notas de sesiones no canceladas que ya han comenzado.');
     await d.prepare("UPDATE mymind.sesiones SET estado_sesion='Realizada' WHERE id=?").run(note.sesion_id);
     result=await d.prepare("UPDATE mymind.notas_clinicas SET estado='finalizada',actualizado_por=? WHERE id=? RETURNING *").get(owner,resource);action='nota_finalizada';
    }
   }
  }else throw new InputError('Acción inválida.');
  revision=typeof result?.version==='number'?result.version:null;
  await d.prepare('INSERT INTO mymind.atencion_eventos(paciente_id,usuario_id,actor_id,accion,recurso_id,version) VALUES(?,?,?,?,?,?)').run(id,owner,owner,action,resource,revision);
  await d.exec('COMMIT');return result;
 }catch(e){await d.exec('ROLLBACK');throw e;}
}
