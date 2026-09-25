-- Private application schema. Browser Supabase clients have no clinical table access.
CREATE SCHEMA IF NOT EXISTS mymind;
SET LOCAL search_path TO mymind, public;
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'psicologo' CHECK (rol IN ('psicologo', 'administrador')),
  nombre TEXT NOT NULL,
  especialidad TEXT NOT NULL DEFAULT '',
  tono TEXT NOT NULL DEFAULT 'Empático' CHECK (tono IN ('Empático', 'Educativo', 'Clínico/Divulgativo')),
  enlace_consulta TEXT NOT NULL DEFAULT '',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT (now())
);


CREATE TABLE IF NOT EXISTS pacientes (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (gen_random_uuid()::text),
  nombre_completo TEXT NOT NULL CHECK (length(trim(nombre_completo)) > 0),
  email TEXT,
  telefono TEXT,
  estado TEXT NOT NULL DEFAULT 'Nuevo contacto'
    CHECK (estado IN ('Nuevo contacto', 'En evaluación', 'Tratamiento activo', 'Inactivo')),
  motivo_consulta TEXT,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT (now()),
  notas_confidenciales TEXT,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  fuente_captacion TEXT NOT NULL DEFAULT 'Registro manual'
);

CREATE TABLE IF NOT EXISTS sesiones (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (gen_random_uuid()::text),
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  fecha_hora TIMESTAMPTZ NOT NULL,
  estado_sesion TEXT NOT NULL DEFAULT 'Programada'
    CHECK (estado_sesion IN ('Programada', 'Realizada', 'Cancelada')),
  duracion_minutos INTEGER NOT NULL DEFAULT 50 CHECK (duracion_minutos BETWEEN 5 AND 480),
  modalidad TEXT NOT NULL DEFAULT 'Presencial' CHECK (modalidad IN ('Presencial', 'Online')),
  notas_evolucion TEXT
);

CREATE INDEX IF NOT EXISTS idx_pacientes_estado ON pacientes(estado);
CREATE INDEX IF NOT EXISTS idx_sesiones_paciente_fecha ON sesiones(paciente_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_sesiones_fecha ON sesiones(fecha_hora);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_expiration ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  clave TEXT PRIMARY KEY NOT NULL,
  intentos INTEGER NOT NULL,
  reinicio BIGINT NOT NULL
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
  creado_en TIMESTAMPTZ NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS idx_lead_owner ON lead_magnets(usuario_id);
CREATE TABLE IF NOT EXISTS captaciones (
  id TEXT PRIMARY KEY NOT NULL,
  magnet_id TEXT NOT NULL REFERENCES lead_magnets(id),
  paciente_id TEXT NOT NULL REFERENCES pacientes(id),
  consentimiento_contacto INTEGER NOT NULL CHECK (consentimiento_contacto = 1),
  consentimiento_marketing INTEGER NOT NULL DEFAULT 0 CHECK (consentimiento_marketing IN (0, 1)),
  texto_consentimiento TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT (now()),
  UNIQUE(magnet_id, paciente_id)
);
CREATE TABLE IF NOT EXISTS setup_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS configuracion_sitio (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  profesional_id TEXT NOT NULL REFERENCES usuarios(id),
  zona_horaria TEXT NOT NULL DEFAULT 'America/Santiago'
);
CREATE TABLE IF NOT EXISTS disponibilidad_publica (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha_hora TIMESTAMPTZ NOT NULL,
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
  creado_en TIMESTAMPTZ NOT NULL DEFAULT (now())
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


CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_lower ON usuarios(lower(email));
CREATE INDEX IF NOT EXISTS idx_paciente_owner ON pacientes(usuario_id, estado);
CREATE INDEX IF NOT EXISTS idx_paciente_owner_email ON pacientes(usuario_id, email);
CREATE OR REPLACE FUNCTION mymind.keep_patient_owner() RETURNS trigger LANGUAGE plpgsql SET search_path = mymind, pg_temp AS $$
BEGIN
  IF OLD.usuario_id IS DISTINCT FROM NEW.usuario_id THEN
    RAISE EXCEPTION 'Patient owner cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS paciente_owner_immutable ON pacientes;
CREATE TRIGGER paciente_owner_immutable BEFORE UPDATE OF usuario_id ON pacientes FOR EACH ROW EXECUTE FUNCTION mymind.keep_patient_owner();
REVOKE ALL ON SCHEMA mymind FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA mymind FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mymind FROM PUBLIC;
DO $$ DECLARE r record; role_name text; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'mymind' LOOP
    EXECUTE format('ALTER TABLE mymind.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA mymind FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA mymind FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mymind FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
