import { generateAvailability } from '@/lib/availability';
import { publicProfessional, availableSlots } from '@/lib/booking';
import { json, failure } from '@/lib/api';
import { db } from '@/lib/db';
import { expireRequests } from '@/lib/booking-requests';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
    try {
        const professional = (await publicProfessional());
        if (professional)
            (await generateAvailability(professional.id, professional.zona_horaria));
        if (professional) await expireRequests(professional.id);
        const settings=professional?await db().prepare('SELECT solicitud_anticipacion_horas,solicitud_respuesta_horas FROM usuarios WHERE id=?').get(professional.id):null;
        return json({ zona_horaria: professional?.zona_horaria || 'America/Santiago', horarios: professional ? (await availableSlots(professional.id)) : [],ajustes:settings });
    }
    catch (e) {
        return failure(e);
    }
}
