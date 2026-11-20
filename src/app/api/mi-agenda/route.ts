import { after } from 'next/server';
import { body,failure,json,sameOrigin,InputError } from '@/lib/api';
import { db } from '@/lib/db';
import { availableSlots } from '@/lib/booking';
import { generateAvailability } from '@/lib/availability';
import { patientAccess,expireRequests,requestColumns,createBookingRequest } from '@/lib/booking-requests';
import { rateLimit } from '@/lib/auth';
import { dispatchRequestNotifications } from '@/lib/request-notifications';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {
    const access=await patientAccess(request);const owner=String(access.usuario_id);
    await expireRequests(owner);
    const zone=String((await db().prepare('SELECT zona_horaria FROM configuracion_sitio WHERE profesional_id=?').get(owner))?.zona_horaria||'America/Santiago');
    await generateAvailability(owner,zone);
    const requests=await db().prepare(`SELECT ${requestColumns} FROM mymind.solicitudes_cita r
      WHERE r.paciente_id=? AND r.usuario_id=? ORDER BY r.creado_en DESC LIMIT 100`).all(access.paciente_id,owner);
    const settings=await db().prepare('SELECT solicitud_anticipacion_horas,solicitud_respuesta_horas FROM usuarios WHERE id=?').get(owner);
    after(dispatchRequestNotifications);
    return json({nombre:access.nombre_completo,profesional:access.profesional,zona_horaria:zone,horarios:await availableSlots(owner),solicitudes:requests,ajustes:settings});
  } catch(error) { return failure(error); }
}
export async function POST(request:Request) {
  try {
    sameOrigin(request);const access=await patientAccess(request);const value=await body(request);
    if (value.consentimiento!==true) throw new InputError('Acepta el uso de tus datos para gestionar la solicitud.');
    await rateLimit('request:'+access.paciente_id,20,3600000);
    const row=await createBookingRequest({owner:String(access.usuario_id),patient:String(access.paciente_id),slot:String(value.horario_id||''),modality:String(value.modalidad||''),id:String(value.solicitud_id||''),trackingToken:String(value.seguimiento||'')});
    const safe=await db().prepare(`SELECT ${requestColumns} FROM mymind.solicitudes_cita r WHERE r.id=?`).get(row.id);
    after(dispatchRequestNotifications);
    return json(safe,201);
  } catch(error) { return failure(error); }
}
