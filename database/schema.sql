PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pacientes (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  nombre_completo TEXT NOT NULL CHECK (length(trim(nombre_completo)) > 0),
  email TEXT,
  telefono TEXT,
  estado TEXT NOT NULL DEFAULT 'Nuevo contacto'
    CHECK (estado IN ('Nuevo contacto', 'En evaluación', 'Tratamiento activo', 'Inactivo')),
  motivo_consulta TEXT,
  fecha_registro TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notas_confidenciales TEXT
);

CREATE TABLE IF NOT EXISTS sesiones (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  fecha_hora TEXT NOT NULL CHECK (julianday(fecha_hora) IS NOT NULL),
  estado_sesion TEXT NOT NULL DEFAULT 'Programada'
    CHECK (estado_sesion IN ('Programada', 'Realizada', 'Cancelada')),
  duracion_minutos INTEGER NOT NULL DEFAULT 50 CHECK (duracion_minutos BETWEEN 5 AND 480),
  modalidad TEXT NOT NULL DEFAULT 'Presencial' CHECK (modalidad IN ('Presencial', 'Online')),
  notas_evolucion TEXT
);

CREATE INDEX IF NOT EXISTS idx_pacientes_estado ON pacientes(estado);
CREATE INDEX IF NOT EXISTS idx_sesiones_paciente_fecha ON sesiones(paciente_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_sesiones_fecha ON sesiones(fecha_hora);

