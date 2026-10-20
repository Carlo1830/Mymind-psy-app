ALTER TABLE mymind.usuarios
 ADD COLUMN google_calendar_token TEXT,
 ADD COLUMN sync_enabled BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN recordatorios_email BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN recordatorios_whatsapp BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN recordatorio_horas INTEGER NOT NULL DEFAULT 24 CHECK (recordatorio_horas BETWEEN 1 AND 168);
COMMENT ON COLUMN mymind.usuarios.google_calendar_token IS 'Reserved for encrypted OAuth credentials. Never expose through profile APIs.';
ALTER TABLE mymind.sesiones ADD COLUMN estado_confirmacion TEXT NOT NULL DEFAULT 'pendiente'
 CHECK (estado_confirmacion IN ('pendiente','confirmada','recordatorio_enviado','cancelada'));
UPDATE mymind.sesiones SET estado_confirmacion='cancelada' WHERE estado_sesion='Cancelada';
CREATE TABLE mymind.agenda_emails (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 sesion_id TEXT NOT NULL REFERENCES mymind.sesiones(id) ON DELETE CASCADE,
 usuario_id TEXT NOT NULL REFERENCES mymind.usuarios(id) ON DELETE CASCADE,
 fecha_cita TIMESTAMPTZ NOT NULL,
 tipo TEXT NOT NULL CHECK(tipo IN ('confirmacion','recordatorio')),
 destinatario TEXT NOT NULL, modalidad TEXT NOT NULL, zona_horaria TEXT NOT NULL,
 enviar_en TIMESTAMPTZ NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','enviado','omitido','fallido')),
 intentos INTEGER NOT NULL DEFAULT 0, enviado_en TIMESTAMPTZ,
 UNIQUE(sesion_id,fecha_cita,tipo)
);
ALTER TABLE mymind.agenda_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mymind.agenda_emails FROM PUBLIC;
CREATE INDEX agenda_emails_pending ON mymind.agenda_emails(enviar_en) WHERE estado='pendiente';
CREATE FUNCTION mymind.agenda_state() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF NEW.estado_sesion='Cancelada' THEN NEW.estado_confirmacion:='cancelada';
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora OR OLD.estado_sesion='Cancelada' THEN NEW.estado_confirmacion:='pendiente'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agenda_state BEFORE INSERT OR UPDATE OF fecha_hora,estado_sesion ON mymind.sesiones FOR EACH ROW EXECUTE FUNCTION mymind.agenda_state();
CREATE FUNCTION mymind.agenda_queue_email() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
DECLARE recipient TEXT; owner_id TEXT; enabled BOOLEAN; hours_before INTEGER; zone TEXT;
BEGIN
 IF NEW.estado_sesion<>'Programada' OR NEW.fecha_hora<=now() THEN RETURN NEW; END IF;
 SELECT p.email,p.usuario_id,u.recordatorios_email,u.recordatorio_horas,COALESCE(c.zona_horaria,'America/Santiago')
 INTO recipient,owner_id,enabled,hours_before,zone FROM pacientes p JOIN usuarios u ON u.id=p.usuario_id
 LEFT JOIN configuracion_sitio c ON c.profesional_id=u.id WHERE p.id=NEW.paciente_id;
 IF enabled AND recipient IS NOT NULL AND recipient<>'' THEN
 INSERT INTO agenda_emails(sesion_id,usuario_id,fecha_cita,tipo,destinatario,modalidad,zona_horaria,enviar_en)
 VALUES (NEW.id,owner_id,NEW.fecha_hora,'confirmacion',recipient,NEW.modalidad,zone,now()),
 (NEW.id,owner_id,NEW.fecha_hora,'recordatorio',recipient,NEW.modalidad,zone,GREATEST(now()+interval '5 minutes',NEW.fecha_hora-hours_before*interval '1 hour'))
 ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agenda_email AFTER INSERT OR UPDATE OF fecha_hora,estado_sesion,modalidad ON mymind.sesiones FOR EACH ROW EXECUTE FUNCTION mymind.agenda_queue_email();
