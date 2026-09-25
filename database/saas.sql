CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'psicologo' CHECK (rol IN ('psicologo', 'administrador')),
  nombre TEXT NOT NULL,
  especialidad TEXT NOT NULL DEFAULT '',
  tono TEXT NOT NULL DEFAULT 'Empático' CHECK (tono IN ('Empático', 'Educativo', 'Clínico/Divulgativo')),
  enlace_consulta TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_expiration ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  clave TEXT PRIMARY KEY NOT NULL,
  intentos INTEGER NOT NULL,
  reinicio INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plantillas (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  paso INTEGER NOT NULL DEFAULT 1,
  dias_espera INTEGER NOT NULL DEFAULT 0,
  asunto TEXT NOT NULL,
  contenido TEXT NOT NULL,
  UNIQUE(usuario_id, categoria, paso)
);
CREATE TABLE IF NOT EXISTS lead_magnets (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('guia', 'test')),
  contenido TEXT NOT NULL,
  preguntas TEXT NOT NULL DEFAULT '[]',
  publicado INTEGER NOT NULL DEFAULT 0 CHECK (publicado IN (0, 1)),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_lead_owner ON lead_magnets(usuario_id);
CREATE TABLE IF NOT EXISTS captaciones (
  id TEXT PRIMARY KEY NOT NULL,
  magnet_id TEXT NOT NULL REFERENCES lead_magnets(id),
  paciente_id TEXT NOT NULL REFERENCES pacientes(id),
  consentimiento_contacto INTEGER NOT NULL CHECK (consentimiento_contacto = 1),
  consentimiento_marketing INTEGER NOT NULL DEFAULT 0 CHECK (consentimiento_marketing IN (0, 1)),
  texto_consentimiento TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(magnet_id, paciente_id)
);
CREATE TABLE IF NOT EXISTS setup_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS configuracion_sitio (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  profesional_id TEXT NOT NULL REFERENCES usuarios(id),
  zona_horaria TEXT NOT NULL DEFAULT 'America/Santiago'
);
CREATE TABLE IF NOT EXISTS disponibilidad_publica (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha_hora TEXT NOT NULL,
  duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos BETWEEN 5 AND 480),
  modalidad TEXT NOT NULL CHECK (modalidad IN ('Presencial', 'Online', 'Ambas')),
  regla_version INTEGER NOT NULL DEFAULT 0,
  publicado INTEGER NOT NULL DEFAULT 1 CHECK (publicado IN (0, 1)),
  sesion_id TEXT UNIQUE REFERENCES sesiones(id),
  UNIQUE(usuario_id, fecha_hora)
);
CREATE INDEX IF NOT EXISTS idx_disponibilidad_owner ON disponibilidad_publica(usuario_id, fecha_hora);
CREATE TABLE IF NOT EXISTS reservas_publicas (
  id TEXT PRIMARY KEY NOT NULL,
  disponibilidad_id TEXT NOT NULL REFERENCES disponibilidad_publica(id),
  sesion_id TEXT NOT NULL UNIQUE REFERENCES sesiones(id),
  consentimiento TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS reglas_disponibilidad (
  usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id),
  dias TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  hora_inicio TEXT NOT NULL DEFAULT '09:00',
  hora_fin TEXT NOT NULL DEFAULT '18:00',
  duracion_minutos INTEGER NOT NULL DEFAULT 50,
  modalidad TEXT NOT NULL DEFAULT 'Ambas',
  activa INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  generado_dia TEXT NOT NULL DEFAULT ''
);

