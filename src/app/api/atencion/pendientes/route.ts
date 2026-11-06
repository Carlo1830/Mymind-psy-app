import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    // Only operational metadata; no clinical text belongs on the dashboard.
    const rows = await db().prepare(`
      SELECT n.id, n.paciente_id, n.sesion_id, p.nombre_completo,
             s.fecha_hora, s.estado_sesion, n.actualizado_en,
             COALESCE(p.status, 'active') AS paciente_status,
             count(*) OVER () AS total
      FROM mymind.notas_clinicas n
      JOIN mymind.pacientes p ON p.id = n.paciente_id AND p.usuario_id = n.usuario_id
      JOIN mymind.sesiones s ON s.id = n.sesion_id AND s.paciente_id = n.paciente_id
      WHERE n.usuario_id = ? AND n.estado = 'borrador'
      ORDER BY s.fecha_hora::timestamptz, n.id
      LIMIT 5
    `).all(user.id);
    return json({ total: Number(rows[0]?.total || 0), notas: rows.map(row => ({
      id: row.id, paciente_id: row.paciente_id, sesion_id: row.sesion_id,
      nombre_completo: row.nombre_completo, fecha_hora: row.fecha_hora,
      estado_sesion: row.estado_sesion, actualizado_en: row.actualizado_en, paciente_status: row.paciente_status,
    })) });
  } catch (error) { return failure(error); }
}
