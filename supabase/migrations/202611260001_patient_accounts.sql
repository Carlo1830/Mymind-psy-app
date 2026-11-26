-- Adult patient portal. Clinical records are not automatically published.
CREATE TABLE mymind.portal_cuentas (
 paciente_id text PRIMARY KEY,
 usuario_id text NOT NULL,
 email text NOT NULL UNIQUE CHECK(email=lower(trim(email))),
 password_hash text,
 fecha_nacimiento date NOT NULL,
 habilitado boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,
 activado_en timestamptz,
 creado_en timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT
);
CREATE TABLE mymind.portal_enlaces (
 token_hash text PRIMARY KEY,
 paciente_id text NOT NULL REFERENCES mymind.portal_cuentas(paciente_id) ON DELETE CASCADE,
 tipo text NOT NULL CHECK(tipo IN ('invitacion','recuperacion')),
 vence_en timestamptz NOT NULL,
 UNIQUE(paciente_id,tipo)
);
CREATE TABLE mymind.portal_sesiones (
 token_hash text PRIMARY KEY,
 paciente_id text NOT NULL REFERENCES mymind.portal_cuentas(paciente_id) ON DELETE CASCADE,
 version_cuenta integer NOT NULL,
 vence_en timestamptz NOT NULL
);
CREATE INDEX portal_sesiones_paciente ON mymind.portal_sesiones(paciente_id);
CREATE TABLE mymind.portal_fichas (
 paciente_id text PRIMARY KEY REFERENCES mymind.portal_cuentas(paciente_id),
 datos jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(datos)='object'),
 version integer NOT NULL DEFAULT 1,
 actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mymind.portal_documentos (
 id text PRIMARY KEY,
 paciente_id text NOT NULL,
 usuario_id text NOT NULL,
 titulo text NOT NULL CHECK(length(trim(titulo)) BETWEEN 1 AND 200),
 tipo text NOT NULL CHECK(tipo IN ('indicaciones','consentimiento','prontuario','informe','comprobante')),
 contenido text NOT NULL CHECK(length(trim(contenido)) BETWEEN 1 AND 50000),
 publicado boolean NOT NULL DEFAULT true,
 creado_en timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT
);
CREATE INDEX portal_documentos_paciente ON mymind.portal_documentos(paciente_id,creado_en DESC);
CREATE TABLE mymind.portal_peticiones (
 id text PRIMARY KEY,
 paciente_id text NOT NULL,
 usuario_id text NOT NULL,
 tipo text NOT NULL CHECK(tipo IN ('acceso_prontuario','correccion')),
 texto text NOT NULL CHECK(length(trim(texto)) BETWEEN 1 AND 3000),
 respuesta text,
 creado_en timestamptz NOT NULL DEFAULT now(),
 respondido_en timestamptz,
 FOREIGN KEY(paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT
);
CREATE TABLE mymind.portal_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 paciente_id text NOT NULL REFERENCES mymind.pacientes(id),
 actor text NOT NULL CHECK(actor IN ('profesional','paciente','sistema')),
 accion text NOT NULL,
 recurso_id text,
 creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mymind.portal_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.portal_enlaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.portal_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.portal_fichas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.portal_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.portal_peticiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.portal_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mymind.portal_cuentas,mymind.portal_enlaces,mymind.portal_sesiones,mymind.portal_fichas,
 mymind.portal_documentos,mymind.portal_peticiones,mymind.portal_eventos FROM PUBLIC;
CREATE FUNCTION mymind.portal_evento_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Portal audit events are append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER portal_evento_inmutable BEFORE UPDATE OR DELETE ON mymind.portal_eventos
 FOR EACH ROW EXECUTE FUNCTION mymind.portal_evento_inmutable();
REVOKE ALL ON FUNCTION mymind.portal_evento_inmutable() FROM PUBLIC;
CREATE FUNCTION mymind.portal_cambio_identidad() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF lower(trim(NEW.email)) IS DISTINCT FROM lower(trim(OLD.email))
 OR (NEW.status='archived' AND NEW.status IS DISTINCT FROM OLD.status) THEN
  UPDATE portal_cuentas SET habilitado=false,version=version+1 WHERE paciente_id=NEW.id;
  IF FOUND THEN
   DELETE FROM portal_sesiones WHERE paciente_id=NEW.id;
   DELETE FROM portal_enlaces WHERE paciente_id=NEW.id;
   DELETE FROM accesos_paciente WHERE paciente_id=NEW.id;
   INSERT INTO portal_eventos(paciente_id,actor,accion) VALUES(NEW.id,'sistema','identidad_o_archivo_actualizado');
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER portal_cambio_identidad AFTER UPDATE ON mymind.pacientes
 FOR EACH ROW EXECUTE FUNCTION mymind.portal_cambio_identidad();
REVOKE ALL ON FUNCTION mymind.portal_cambio_identidad() FROM PUBLIC;
