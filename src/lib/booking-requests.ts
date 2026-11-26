import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { field, InputError } from '@/lib/api';
import { HttpError } from '@/lib/errors';
import { assertNoOverlap } from '@/lib/booking';
import { currentPatient } from '@/lib/patient-account';

export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');
export const newAccessToken = () => randomBytes(32).toString('hex');
export const requestColumns = `r.id,r.fecha_hora,r.duracion_minutos,r.modalidad,r.estado,r.creado_en,r.vence_en,
 r.respondido_en,r.mensaje,r.alternativa_horario_id,r.alternativa_fecha,r.alternativa_modalidad,r.alternativa_duracion,
 (SELECT json_build_object('fecha_hora',s.fecha_hora,'duracion_minutos',s.duracion_minutos,'modalidad',s.modalidad,'estado',s.estado_sesion)
  FROM mymind.sesiones s WHERE s.id=r.sesion_id) AS cita`;

export async function expireRequests(owner?: string) {
  await db().prepare('SELECT mymind.vencer_solicitudes(?::text)').get(owner || null);
}

export async function patientAccess(request: Request) {
  const account=await currentPatient();
  if(account)return account;
  const token = request.headers.get('x-patient-token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, 'Abre el enlace privado que te compartió tu profesional.');
  const access = await db().prepare(`SELECT a.paciente_id,a.usuario_id,p.nombre_completo,u.nombre AS profesional
    FROM mymind.accesos_paciente a JOIN pacientes p ON p.id=a.paciente_id AND p.usuario_id=a.usuario_id
    JOIN usuarios u ON u.id=a.usuario_id
    WHERE a.token_hash=? AND a.vence_en>now() AND COALESCE(p.status,'active')='active'`).get(tokenDigest(token));
  if (!access) throw new HttpError(401, 'Este enlace venció o fue revocado. Solicita uno nuevo a tu profesional.');
  return access;
}

export async function createBookingRequest(input: {
  owner: string; patient: string; slot: string; modality: string; id: string; trackingToken: string;
  contact?: {name:string;email:string;phone:string|null};
}) {
  if (!/^[a-f0-9-]{36}$/i.test(input.id) || !/^[a-f0-9]{64}$/.test(input.trackingToken)) throw new InputError('Identificador de solicitud inválido.');
  const database = db();
  const contentHash=tokenDigest(JSON.stringify([input.patient,input.slot,input.modality,input.contact||null]));
  await database.begin(input.owner);
  try {
    await database.prepare('SELECT mymind.vencer_solicitudes(?)').get(input.owner);
    const previous = await database.prepare(`SELECT ${requestColumns},r.horario_id,r.paciente_id,r.seguimiento_hash,r.contenido_hash
      FROM mymind.solicitudes_cita r WHERE r.id=? AND r.usuario_id=?`).get(input.id,input.owner);
    if (previous) {
      if (previous.contenido_hash!==contentHash || previous.seguimiento_hash!==tokenDigest(input.trackingToken)) throw new HttpError(409,'La solicitud ya se utilizó con otros datos.');
      await database.exec('COMMIT');
      return previous;
    }
    const settings = await database.prepare('SELECT solicitud_anticipacion_horas,solicitud_respuesta_horas FROM usuarios WHERE id=?').get(input.owner);
    const slot = await database.prepare(`SELECT * FROM disponibilidad_publica WHERE id=? AND usuario_id=? AND publicado=1
      AND sesion_id IS NULL AND fecha_hora>=now()+(? * interval '1 hour') AND fecha_hora<now()+interval '90 days'`).get(input.slot,input.owner,settings!.solicitud_anticipacion_horas);
    if (!slot) throw new HttpError(409,'El horario ya no está disponible o no cumple la anticipación mínima.');
    if (!['Online','Presencial'].includes(input.modality) || (slot.modalidad!=='Ambas' && slot.modalidad!==input.modality)) throw new InputError('Selecciona una modalidad disponible.');
    await assertNoOverlap(input.owner,String(slot.fecha_hora),Number(slot.duracion_minutos),'',database);
    let patientId=input.patient;
    if (input.contact) {
      const existing=await database.prepare('SELECT id FROM pacientes WHERE usuario_id=? AND lower(email)=?').get(input.owner,input.contact.email);
      if (existing) throw new HttpError(409,'Si ya tienes ficha en la consulta, solicita a tu profesional tu enlace privado para agendar.');
      patientId=randomUUID();
      await database.prepare(`INSERT INTO pacientes(id,usuario_id,nombre_completo,email,telefono,estado,fuente_captacion)
        VALUES(?,?,?,?,?,'Nuevo contacto','Reserva desde la web')`).run(patientId,input.owner,input.contact.name,input.contact.email,input.contact.phone);
    } else {
      const patient=await database.prepare("SELECT id FROM pacientes WHERE id=? AND usuario_id=? AND COALESCE(status,'active')='active'").get(patientId,input.owner);
      if (!patient) throw new HttpError(404,'Paciente no disponible.');
    }
    const result = await database.prepare(`INSERT INTO mymind.solicitudes_cita
      (id,usuario_id,paciente_id,horario_id,fecha_hora,duracion_minutos,modalidad,vence_en,seguimiento_hash,contenido_hash)
      VALUES(?,?,?,?,?,?,?,now()+(? * interval '1 hour'),?,?) RETURNING *`).get(
      input.id,input.owner,patientId,input.slot,slot.fecha_hora,slot.duracion_minutos,input.modality,
      settings!.solicitud_respuesta_horas,tokenDigest(input.trackingToken),contentHash);
    await database.exec('COMMIT');
    return result!;
  } catch (error) { await database.exec('ROLLBACK'); throw error; }
}

export async function answerBookingRequest(owner: string,id: string,value: Record<string,unknown>) {
  const action = String(value.accion);
  if (!['aceptar','rechazar','alternativa'].includes(action)) throw new InputError('Selecciona una respuesta válida.');
  const message = field(value.mensaje,'Mensaje',1000) || '';
  const database = db();
  await database.begin(owner);
  try {
    const row = await database.prepare('SELECT * FROM mymind.solicitudes_cita WHERE id=? AND usuario_id=? FOR UPDATE').get(id,owner);
    if (!row) throw new HttpError(404,'Solicitud no encontrada.');
    const target = action==='aceptar'?'aceptada':action==='rechazar'?'rechazada':'alternativa';
    if (row.estado!=='pendiente') {
      if (row.estado===target) { await database.exec('COMMIT'); return {estado:row.estado}; }
      throw new HttpError(409,'La solicitud ya recibió una respuesta o venció.');
    }
    const expired = await database.prepare('SELECT ?::timestamptz<=now() AS vencida').get(row.vence_en);
    if (expired!.vencida) {
      await database.prepare("UPDATE mymind.solicitudes_cita SET estado='vencida',respondido_en=now() WHERE id=?").run(id);
      await database.exec('COMMIT');
      throw new HttpError(409,'El plazo de respuesta se agotó. El paciente debe solicitar otro horario.');
    }
    const activePatient = await database.prepare("SELECT id FROM pacientes WHERE id=? AND usuario_id=? AND COALESCE(status,'active')='active'").get(row.paciente_id,owner);
    if (!activePatient && action!=='rechazar') throw new HttpError(409,'Restaura al paciente antes de confirmar su solicitud.');
    let sessionId: string | null = null;
    let alternative: Record<string,unknown> | undefined;
    if (action==='aceptar') {
      await assertNoOverlap(owner,String(row.fecha_hora),Number(row.duracion_minutos),'',database,id);
      sessionId=randomUUID();
      await database.prepare(`INSERT INTO sesiones(id,paciente_id,fecha_hora,duracion_minutos,modalidad,estado_sesion)
        VALUES(?,?,?,?,?,'Programada')`).run(sessionId,row.paciente_id,row.fecha_hora,row.duracion_minutos,row.modalidad);
    }
    if (action==='alternativa') {
      const settings = await database.prepare('SELECT solicitud_anticipacion_horas FROM usuarios WHERE id=?').get(owner);
      alternative = await database.prepare(`SELECT * FROM disponibilidad_publica WHERE id=? AND usuario_id=? AND publicado=1
        AND sesion_id IS NULL AND fecha_hora>=now()+(? * interval '1 hour') AND fecha_hora<now()+interval '90 days'`).get(String(value.horario_id||''),owner,settings!.solicitud_anticipacion_horas);
      if (!alternative || alternative.id===row.horario_id) throw new InputError('Elige otro horario disponible.');
      await assertNoOverlap(owner,String(alternative.fecha_hora),Number(alternative.duracion_minutos),'',database);
    }
    await database.prepare(`UPDATE mymind.solicitudes_cita SET estado=?,respondido_en=now(),sesion_id=?,mensaje=?,
      alternativa_horario_id=?,alternativa_fecha=?,alternativa_modalidad=?,alternativa_duracion=? WHERE id=?`).run(
      target,sessionId,message,alternative?String(alternative.id):null,alternative?String(alternative.fecha_hora):null,
      alternative?String(alternative.modalidad):null,alternative?Number(alternative.duracion_minutos):null,id);
    if (sessionId) await database.prepare('UPDATE disponibilidad_publica SET sesion_id=? WHERE id=? AND usuario_id=?').run(sessionId,row.horario_id,owner);
    await database.exec('COMMIT');
    return {estado:target,sesion_id:sessionId};
  } catch (error) { await database.exec('ROLLBACK'); throw error; }
}
