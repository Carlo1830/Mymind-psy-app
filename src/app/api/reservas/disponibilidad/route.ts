import { generateAvailability } from '@/lib/availability';
import { publicProfessional, availableSlots } from '@/lib/booking';
import { json, failure } from '@/lib/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
    try {
        const professional = (await publicProfessional());
        if (professional)
            (await generateAvailability(professional.id, professional.zona_horaria));
        return json({ zona_horaria: professional?.zona_horaria || 'America/Santiago', horarios: professional ? (await availableSlots(professional.id)) : [] });
    }
    catch (e) {
        return failure(e);
    }
}
