ALTER TABLE mymind.usuarios
 ADD COLUMN solicitud_anticipacion_horas integer NOT NULL DEFAULT 24 CHECK (solicitud_anticipacion_horas BETWEEN 1 AND 720),
 ADD COLUMN solicitud_respuesta_horas integer NOT NULL DEFAULT 6 CHECK (solicitud_respuesta_horas BETWEEN 1 AND 72);

CREATE TABLE mymind.accesos_paciente (
 paciente_id text PRIMARY KEY REFERENCES mymind.pacientes(id) ON DELETE CASCADE,
 usuario_id text NOT NULL REFERENCES mymind.usuarios(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 vence_en timestamptz NOT NULL,
 creado_en timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE CASCADE
);
CREATE TABLE mymind.solicitudes_cita (
 id text PRIMARY KEY,
 usuario_id text NOT NULL REFERENCES mymind.usuarios(id) ON DELETE RESTRICT,
 paciente_id text NOT NULL,
 horario_id text,
 fecha_hora timestamptz NOT NULL,
 duracion_minutos integer NOT NULL CHECK (duracion_minutos BETWEEN 5 AND 480),
 modalidad text NOT NULL CHECK (modalidad IN ('Presencial','Online')),
 estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aceptada','rechazada','alternativa','vencida')),
 creado_en timestamptz NOT NULL DEFAULT now(),
 vence_en timestamptz NOT NULL,
 respondido_en timestamptz,
 sesion_id text UNIQUE REFERENCES mymind.sesiones(id) ON DELETE RESTRICT,
 seguimiento_hash text NOT NULL UNIQUE,
 contenido_hash text NOT NULL,
 mensaje text NOT NULL DEFAULT '',
 alternativa_horario_id text,
 alternativa_fecha timestamptz,
 alternativa_modalidad text,
 alternativa_duracion integer,
 FOREIGN KEY (paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT,
 CHECK (vence_en > creado_en),
 CHECK ((estado='aceptada') = (sesion_id IS NOT NULL))
);
CREATE INDEX solicitudes_pendientes ON mymind.solicitudes_cita(usuario_id,fecha_hora,vence_en) WHERE estado='pendiente';
CREATE INDEX solicitudes_paciente ON mymind.solicitudes_cita(paciente_id,creado_en DESC);
CREATE TABLE mymind.avisos_solicitudes (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 solicitud_id text NOT NULL REFERENCES mymind.solicitudes_cita(id) ON DELETE RESTRICT,
 tipo text NOT NULL,
 destinatario text NOT NULL,
 estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aceptado','fallido','omitido')),
 intentos integer NOT NULL DEFAULT 0,
 enviar_en timestamptz NOT NULL DEFAULT now(),
 creado_en timestamptz NOT NULL DEFAULT now(),
 proveedor_id text,
 UNIQUE(solicitud_id,tipo)
);
CREATE INDEX avisos_solicitudes_cola ON mymind.avisos_solicitudes(enviar_en) WHERE estado='pendiente';
ALTER TABLE mymind.accesos_paciente ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.solicitudes_cita ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.avisos_solicitudes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mymind.accesos_paciente,mymind.solicitudes_cita,mymind.avisos_solicitudes FROM PUBLIC;

CREATE FUNCTION mymind.solicitud_avisos() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
DECLARE recipient text;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT email INTO recipient FROM usuarios WHERE id=NEW.usuario_id;
  IF recipient IS NOT NULL AND recipient<>'' THEN
   INSERT INTO avisos_solicitudes(solicitud_id,tipo,destinatario) VALUES(NEW.id,'nueva',recipient) ON CONFLICT DO NOTHING;
  END IF;
 ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
  SELECT email INTO recipient FROM pacientes WHERE id=NEW.paciente_id;
  IF recipient IS NOT NULL AND recipient<>'' THEN
   INSERT INTO avisos_solicitudes(solicitud_id,tipo,destinatario) VALUES(NEW.id,NEW.estado,recipient) ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER solicitud_avisos AFTER INSERT OR UPDATE OF estado ON mymind.solicitudes_cita FOR EACH ROW EXECUTE FUNCTION mymind.solicitud_avisos();

CREATE FUNCTION mymind.vencer_solicitudes(p_usuario text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
DECLARE owner_id text; affected integer; total integer := 0;
BEGIN
 FOR owner_id IN SELECT DISTINCT usuario_id FROM solicitudes_cita
   WHERE estado='pendiente' AND vence_en<=now() AND (p_usuario IS NULL OR usuario_id=p_usuario) ORDER BY usuario_id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id,0));
  UPDATE solicitudes_cita SET estado='vencida',respondido_en=now()
   WHERE usuario_id=owner_id AND estado='pendiente' AND vence_en<=now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  total := total + affected;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION mymind.vencer_solicitudes(text),mymind.solicitud_avisos() FROM PUBLIC;
