import 'server-only';
import { Database } from '../../database/postgres.mjs';
import type { Paciente, Sesion } from '@/types/database';
export function db() { return new Database(); }
export async function patient(id: string, owner: string) {
  return await db().prepare('SELECT * FROM pacientes WHERE id = ? AND usuario_id = ?').get(id, owner) as unknown as Paciente | undefined;
}
export async function sessions(id: string, owner: string) {
  return await db().prepare('SELECT s.* FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id WHERE s.paciente_id = ? AND p.usuario_id = ? ORDER BY s.fecha_hora DESC, s.id DESC').all(id, owner) as unknown as Sesion[];
}
