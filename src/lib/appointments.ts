import { field, InputError } from '@/lib/api';
export function isoDate(value: unknown) {
  const date = field(value, 'Fecha y hora', 40, true)!;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(date) || !Number.isFinite(Date.parse(date))) throw new InputError('Fecha y hora inválidas.');
  const iso = new Date(date).toISOString();
  if (iso !== date.replace(/Z$/, date.includes('.') ? 'Z' : '.000Z')) throw new InputError('Fecha y hora inválidas.');
  return iso;
}
export function appointmentInput(value: Record<string, unknown>) {
  const patient = field(value.paciente_id, 'Paciente', 100, true)!;
  const date = isoDate(value.fecha_hora);
  const duration = value.duracion_minutos;
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 5 || duration > 480) throw new InputError('La duración debe ser un entero entre 5 y 480 minutos.');
  if (!['Programada', 'Realizada', 'Cancelada'].includes(String(value.estado_sesion))) throw new InputError('Estado de cita inválido.');
  if (!['Presencial', 'Online'].includes(String(value.modalidad))) throw new InputError('Modalidad inválida.');
  return [patient, date, duration, value.estado_sesion as string, value.modalidad as string] as const;
}
export const appointmentColumns = 's.id, s.paciente_id, s.fecha_hora, s.duracion_minutos, s.estado_sesion, s.modalidad, p.nombre_completo';
