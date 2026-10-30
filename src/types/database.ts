export type StatusPaciente = 'active' | 'archived';
export type EstadoPaciente = 'Nuevo contacto' | 'En evaluación' | 'Tratamiento activo' | 'Inactivo';
export type EstadoSesion = 'Programada' | 'Realizada' | 'Cancelada' | 'Ausente';

export interface Paciente {
  etiquetas: string[];
  id: string;
  nombre_completo: string;
  fuente_captacion: string;
  email: string | null;
  telefono: string | null;
  estado: EstadoPaciente;
  status: StatusPaciente;
  motivo_consulta: string | null;
  antecedentes: string | null;
  hipotesis_diagnostica: string | null;
  expediente_version: number;
  /** Fecha ISO 8601 en UTC. */
  fecha_registro: string;
  notas_confidenciales: string | null;
}

export type EstadoConfirmacion = 'pendiente' | 'confirmada' | 'recordatorio_enviado' | 'cancelada';
export interface Sesion {
  estado_confirmacion: EstadoConfirmacion;
  serie_id: string | null;
  confirmada_en: string | null;
  confirmacion_fuente: string | null;
  id: string;
  paciente_id: string;
  /** Guardar como ISO 8601 en UTC. */
  fecha_hora: string;
  estado_sesion: EstadoSesion;
  duracion_minutos: number;
  modalidad: 'Presencial' | 'Online';
  notas_evolucion: string | null;
}


