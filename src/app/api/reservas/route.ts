import { after } from 'next/server';
import { publicProfessional } from '@/lib/booking';
import { body,failure,field,InputError,json,sameOrigin } from '@/lib/api';
import { rateLimit } from '@/lib/auth';
import { createBookingRequest,requestColumns } from '@/lib/booking-requests';
import { db } from '@/lib/db';
import { dispatchRequestNotifications } from '@/lib/request-notifications';
export const runtime='nodejs';
export async function POST(request:Request) {
  try {
    sameOrigin(request);const professional=await publicProfessional();
    if (!professional) return json({error:'La consulta no está disponible.'},404);
    const value=await body(request);
    if (value.website || value.consentimiento!==true) throw new InputError('Acepta el uso de tus datos para gestionar la solicitud.');
    const name=field(value.nombre_completo,'Nombre',200,true)!;
    const email=field(value.email,'Correo',254,true)!.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Correo inválido.');
    await rateLimit('booking:'+email,8,3600000);await rateLimit('booking:global',200,3600000);
    const row=await createBookingRequest({owner:professional.id,patient:'',slot:String(value.horario_id||''),
      modality:String(value.modalidad||''),id:String(value.solicitud_id||''),trackingToken:String(value.seguimiento||''),
      contact:{name,email,phone:field(value.telefono,'Teléfono',50)}});
    const safe=await db().prepare(`SELECT ${requestColumns} FROM mymind.solicitudes_cita r WHERE r.id=?`).get(row.id);
    after(dispatchRequestNotifications);
    return json({...safe,zona_horaria:professional.zona_horaria},201);
  } catch(error) { return failure(error); }
}
