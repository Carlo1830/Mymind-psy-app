-- Coordination is separate from clinical notes and email delivery.
ALTER TABLE mymind.sesiones DROP CONSTRAINT sesiones_estado_sesion_check;
ALTER TABLE mymind.sesiones ADD CONSTRAINT sesiones_estado_sesion_check CHECK(estado_sesion IN ('Programada','Realizada','Cancelada','Ausente'));
ALTER TABLE mymind.sesiones ADD COLUMN confirmacion_version INTEGER NOT NULL DEFAULT 0, ADD COLUMN serie_id TEXT, ADD COLUMN confirmada_en TIMESTAMPTZ, ADD COLUMN confirmacion_fuente TEXT CHECK(confirmacion_fuente IN ('paciente','profesional'));
CREATE INDEX sesiones_serie ON mymind.sesiones(serie_id) WHERE serie_id IS NOT NULL;
ALTER TABLE mymind.agenda_emails ADD COLUMN primer_intento_en TIMESTAMPTZ, ADD COLUMN proveedor_id TEXT UNIQUE, ADD COLUMN entrega TEXT NOT NULL DEFAULT 'sin_enviar' CHECK(entrega IN ('sin_enviar','aceptado','entregado','rebotado','queja')), ADD COLUMN entrega_en TIMESTAMPTZ, ADD COLUMN ultimo_error TEXT;
UPDATE mymind.agenda_emails SET entrega='aceptado' WHERE estado='enviado';
CREATE OR REPLACE FUNCTION mymind.agenda_state() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF NEW.estado_sesion='Cancelada' THEN NEW.estado_confirmacion:='cancelada'; NEW.confirmada_en:=NULL; NEW.confirmacion_fuente:=NULL;
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora OR NEW.modalidad IS DISTINCT FROM OLD.modalidad OR NEW.duracion_minutos IS DISTINCT FROM OLD.duracion_minutos OR OLD.estado_sesion='Cancelada' THEN
   NEW.confirmacion_version:=OLD.confirmacion_version+1;
   NEW.estado_confirmacion:='pendiente'; NEW.confirmada_en:=NULL; NEW.confirmacion_fuente:=NULL;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER agenda_state ON mymind.sesiones;
CREATE TRIGGER agenda_state BEFORE INSERT OR UPDATE ON mymind.sesiones FOR EACH ROW EXECUTE FUNCTION mymind.agenda_state();
CREATE OR REPLACE FUNCTION mymind.agenda_queue_email() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
DECLARE recipient TEXT; owner_id TEXT; enabled BOOLEAN; hours_before INTEGER; zone TEXT;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.fecha_hora IS NOT DISTINCT FROM OLD.fecha_hora AND NEW.modalidad IS NOT DISTINCT FROM OLD.modalidad AND NEW.duracion_minutos IS NOT DISTINCT FROM OLD.duracion_minutos AND NEW.estado_sesion IS NOT DISTINCT FROM OLD.estado_sesion THEN RETURN NEW; END IF;
  UPDATE agenda_emails SET estado='omitido' WHERE sesion_id=NEW.id AND estado='pendiente';
 END IF;
 IF NEW.estado_sesion<>'Programada' OR NEW.fecha_hora<=now() THEN RETURN NEW; END IF;
 SELECT p.email,p.usuario_id,u.recordatorios_email,u.recordatorio_horas,COALESCE(c.zona_horaria,'America/Santiago')
 INTO recipient,owner_id,enabled,hours_before,zone FROM pacientes p JOIN usuarios u ON u.id=p.usuario_id
 LEFT JOIN configuracion_sitio c ON c.profesional_id=u.id WHERE p.id=NEW.paciente_id;
 IF enabled AND recipient IS NOT NULL AND recipient<>'' THEN
 INSERT INTO agenda_emails(sesion_id,usuario_id,fecha_cita,tipo,destinatario,modalidad,zona_horaria,enviar_en)
 VALUES (NEW.id,owner_id,NEW.fecha_hora,'confirmacion',recipient,NEW.modalidad,zone,now()),
 (NEW.id,owner_id,NEW.fecha_hora,'recordatorio',recipient,NEW.modalidad,zone,GREATEST(now()+interval '5 minutes',NEW.fecha_hora-hours_before*interval '1 hour'))
 ON CONFLICT(sesion_id,fecha_cita,tipo) DO UPDATE SET destinatario=excluded.destinatario,modalidad=excluded.modalidad,zona_horaria=excluded.zona_horaria,enviar_en=excluded.enviar_en,estado='pendiente',intentos=0,primer_intento_en=NULL,proveedor_id=NULL,entrega='sin_enviar',enviado_en=NULL,entrega_en=NULL,ultimo_error=NULL,creado_en=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER agenda_email ON mymind.sesiones;
CREATE TRIGGER agenda_email AFTER INSERT OR UPDATE OF fecha_hora,estado_sesion,modalidad,duracion_minutos ON mymind.sesiones FOR EACH ROW EXECUTE FUNCTION mymind.agenda_queue_email();
