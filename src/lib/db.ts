import 'server-only';
import { Database } from '../../database/postgres.mjs';
import type { Paciente, Sesion } from '@/types/database';
export function db() { return new Database(); }
export async function patient(id: string, owner: string) {
  return await db().prepare(`SELECT p.*, COALESCE(to_jsonb(p)->'etiquetas', '[]'::jsonb) AS etiquetas, CASE WHEN jsonb_exists(to_jsonb(p), 'antecedentes') THEN to_jsonb(p)->>'antecedentes' ELSE p.notas_confidenciales END AS antecedentes, to_jsonb(p)->>'hipotesis_diagnostica' AS hipotesis_diagnostica, COALESCE((to_jsonb(p)->>'expediente_version')::integer,0) AS expediente_version FROM pacientes p WHERE p.id = ? AND p.usuario_id = ?`).get(id, owner) as unknown as Paciente | undefined;
}
export async function sessions(id: string, owner: string) {
  return await db().prepare('SELECT s.* FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE s.paciente_id = ? AND p.usuario_id = ? ORDER BY s.fecha_hora DESC, s.id DESC').all(id, owner) as unknown as Sesion[];
}
