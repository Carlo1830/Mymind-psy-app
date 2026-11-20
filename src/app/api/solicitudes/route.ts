import { after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { body,failure,json,sameOrigin,InputError } from '@/lib/api';
import { db } from '@/lib/db';
import { availableSlots } from '@/lib/booking';
import { answerBookingRequest,expireRequests,requestColumns } from '@/lib/booking-requests';
import { emailReady } from '@/lib/agenda-email';
import { dispatchRequestNotifications } from '@/lib/request-notifications';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  try {
    const user=await requireUser();
    await expireRequests(user.id);
    const requests=await db().prepare(`SELECT ${requestColumns},p.nombre_completo,r.paciente_id
      FROM mymind.solicitudes_cita r JOIN pacientes p ON p.id=r.paciente_id
      WHERE r.usuario_id=? ORDER BY (r.estado='pendiente') DESC,r.creado_en DESC LIMIT 100`).all(user.id);
    const settings=await db().prepare('SELECT solicitud_anticipacion_horas,solicitud_respuesta_horas FROM usuarios WHERE id=?').get(user.id);
    after(dispatchRequestNotifications);
    return json({solicitudes:requests,ajustes:settings,correo_disponible:emailReady(),horarios:await availableSlots(user.id)});
  } catch(error) { return failure(error); }
}
export async function POST(request:Request) {
  try {
    const user=await requireUser();sameOrigin(request);
    const value=await body(request);
    const result=await answerBookingRequest(user.id,String(value.id||''),value);
    after(dispatchRequestNotifications);
    return json(result);
  } catch(error) { return failure(error); }
}
export async function PUT(request:Request) {
  try {
    const user=await requireUser();sameOrigin(request);
    const value=await body(request);
    const lead=Number(value.anticipacion_horas),response=Number(value.respuesta_horas);
    if (!Number.isInteger(lead)||lead<1||lead>720||!Number.isInteger(response)||response<1||response>72||lead<=response) throw new InputError('La anticipación debe superar el plazo de respuesta. Usa de 1 a 720 horas de anticipación y de 1 a 72 para responder.');
    await db().prepare('UPDATE usuarios SET solicitud_anticipacion_horas=?,solicitud_respuesta_horas=? WHERE id=?').run(lead,response,user.id);
    return json({guardado:true});
  } catch(error) { return failure(error); }
}
