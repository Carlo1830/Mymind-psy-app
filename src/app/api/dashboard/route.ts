import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, json } from '@/lib/api';
import { dashboardPeriods } from '@/lib/periods';
export const runtime = 'nodejs';
export async function GET() {
    try {
        const user = await requireUser();
        const zone = String((await db().prepare('SELECT zona_horaria FROM configuracion_sitio WHERE profesional_id = ?').get(user.id))?.zona_horaria || 'America/Santiago');
        const period = dashboardPeriods(new Date(), zone);
        const active = (await db().prepare("SELECT count(*) AS total FROM pacientes WHERE usuario_id = ? AND estado = 'Tratamiento activo'").get(user.id))!.total;
        const appointments = (await db().prepare("SELECT count(*) AS total FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE p.usuario_id = ? AND s.estado_sesion != 'Cancelada' AND (s.fecha_hora::timestamptz) >= (?::timestamptz) AND (s.fecha_hora::timestamptz) < (?::timestamptz)").get(user.id, period.weekStart, period.weekEnd))!.total;
        const leads = (await db().prepare("SELECT count(*) AS total FROM pacientes WHERE usuario_id = ? AND fuente_captacion != 'Registro manual' AND (fecha_registro::timestamptz) >= (?::timestamptz) AND (fecha_registro::timestamptz) < (?::timestamptz)").get(user.id, period.monthStart, period.monthEnd))!.total;
        const next = (await db().prepare("SELECT s.id, s.fecha_hora, s.modalidad, s.estado_sesion, p.nombre_completo FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE p.usuario_id = ? AND s.estado_sesion = 'Programada' AND (s.fecha_hora::timestamptz) >= (?::timestamptz) ORDER BY s.fecha_hora LIMIT 5").all(user.id, new Date().toISOString()));
        return json({ pacientes_activos: active, citas_semana: appointments, leads_mes: leads, proximas: next, zona_horaria: zone });
    }
    catch (e) {
        return failure(e);
    }
}
