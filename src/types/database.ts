export type StatusPaciente = 'active' | 'archived';
export type EstadoPaciente = 'Nuevo contacto' | 'En evaluación' | 'Tratamiento activo' | 'Inactivo';
export type EstadoSesion = 'Programada' | 'Realizada' | 'Cancelada';

export interface Paciente {
  id: string;
  nombre_completo: string;
  fuente_captacion: string;
  email: string | null;
  telefono: string | null;
  estado: EstadoPaciente;
  status: StatusPaciente;
  motivo_consulta: string | null;
  /** Fecha ISO 8601 en UTC. */
  fecha_registro: string;
  notas_confidenciales: string | null;
}

export interface Sesion {
  id: string;
  paciente_id: string;
  /** Guardar como ISO 8601 en UTC. */
  fecha_hora: string;
  estado_sesion: EstadoSesion;
  duracion_minutos: number;
  modalidad: 'Presencial' | 'Online';
  notas_evolucion: string | null;
}


