-- Complete recorded-but-missing schema objects. Preserve existing clinical text and scores.
-- The legacy archive column was manually created as varchar in production.
-- Normalize its representation without changing active/archived values.
ALTER TABLE mymind.pacientes ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE mymind.pacientes ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE mymind.pacientes DROP CONSTRAINT IF EXISTS pacientes_status_valid;
ALTER TABLE mymind.pacientes ADD CONSTRAINT pacientes_status_valid CHECK(status IN ('active','archived'));
ALTER TABLE mymind.usuarios
 ADD COLUMN IF NOT EXISTS google_calendar_token TEXT,
 ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS recordatorios_email BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS recordatorios_whatsapp BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS recordatorio_horas INTEGER NOT NULL DEFAULT 24 CHECK (recordatorio_horas BETWEEN 1 AND 168);
COMMENT ON COLUMN mymind.usuarios.google_calendar_token IS 'Reserved for encrypted OAuth credentials. Never expose through profile APIs.';
ALTER TABLE mymind.sesiones ADD COLUMN IF NOT EXISTS estado_confirmacion TEXT NOT NULL DEFAULT 'pendiente'
 CHECK (estado_confirmacion IN ('pendiente','confirmada','recordatorio_enviado','cancelada'));
UPDATE mymind.sesiones SET estado_confirmacion='cancelada' WHERE estado_sesion='Cancelada';
UPDATE mymind.sesiones SET estado_confirmacion='pendiente' WHERE estado_confirmacion IS NULL;
ALTER TABLE mymind.sesiones ALTER COLUMN estado_confirmacion SET NOT NULL;
DO $state$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='mymind.sesiones'::regclass AND conname='sesiones_estado_confirmacion_check') THEN ALTER TABLE mymind.sesiones ADD CONSTRAINT sesiones_estado_confirmacion_check CHECK(estado_confirmacion IN ('pendiente','confirmada','recordatorio_enviado','cancelada')); END IF; END $state$;
CREATE TABLE IF NOT EXISTS mymind.agenda_emails (
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
CREATE INDEX IF NOT EXISTS agenda_emails_pending ON mymind.agenda_emails(enviar_en) WHERE estado='pendiente';
CREATE OR REPLACE FUNCTION mymind.agenda_state() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF NEW.estado_sesion='Cancelada' THEN NEW.estado_confirmacion:='cancelada';
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora OR OLD.estado_sesion='Cancelada' THEN NEW.estado_confirmacion:='pendiente'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER agenda_state BEFORE INSERT OR UPDATE OF fecha_hora,estado_sesion ON mymind.sesiones FOR EACH ROW EXECUTE FUNCTION mymind.agenda_state();
CREATE OR REPLACE FUNCTION mymind.agenda_queue_email() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
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
CREATE OR REPLACE TRIGGER agenda_email AFTER INSERT OR UPDATE OF fecha_hora,estado_sesion,modalidad ON mymind.sesiones FOR EACH ROW EXECUTE FUNCTION mymind.agenda_queue_email();

ALTER TABLE mymind.pacientes ADD COLUMN IF NOT EXISTS etiquetas TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE mymind.pacientes SET etiquetas=ARRAY[]::TEXT[] WHERE etiquetas IS NULL;
ALTER TABLE mymind.pacientes ALTER COLUMN etiquetas SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE mymind.pacientes ALTER COLUMN etiquetas SET NOT NULL;
DO $tags$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='mymind.pacientes'::regclass AND conname='pacientes_etiquetas_limit') THEN ALTER TABLE mymind.pacientes ADD CONSTRAINT pacientes_etiquetas_limit CHECK (cardinality(etiquetas)<=20 AND array_position(etiquetas,NULL) IS NULL); END IF; END $tags$;
COMMENT ON COLUMN mymind.pacientes.etiquetas IS 'Custom patient labels scoped through usuario_id. Empty array means no labels.';

ALTER TABLE mymind.pacientes
 ADD COLUMN IF NOT EXISTS antecedentes TEXT,
 ADD COLUMN IF NOT EXISTS hipotesis_diagnostica TEXT,
 ADD COLUMN IF NOT EXISTS expediente_version INTEGER NOT NULL DEFAULT 0;
-- Existing clinical text is retained verbatim; no legacy text is overwritten.
ALTER TABLE mymind.pacientes ALTER COLUMN antecedentes DROP DEFAULT, ALTER COLUMN hipotesis_diagnostica DROP DEFAULT;
CREATE OR REPLACE FUNCTION mymind.expediente_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.antecedentes IS NULL THEN NEW.antecedentes:=NEW.notas_confidenciales; END IF;
 ELSIF NEW.motivo_consulta IS DISTINCT FROM OLD.motivo_consulta
    OR NEW.antecedentes IS DISTINCT FROM OLD.antecedentes
    OR NEW.hipotesis_diagnostica IS DISTINCT FROM OLD.hipotesis_diagnostica
    OR NEW.notas_confidenciales IS DISTINCT FROM OLD.notas_confidenciales THEN
  NEW.expediente_version:=OLD.expediente_version+1;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER expediente_version BEFORE INSERT OR UPDATE ON mymind.pacientes
 FOR EACH ROW EXECUTE FUNCTION mymind.expediente_version_update();
COMMENT ON COLUMN mymind.pacientes.antecedentes IS 'Clinical history; legacy notes copied without deleting their original.';

ALTER TABLE mymind.evaluaciones_clinicas ALTER COLUMN fecha_evaluacion DROP DEFAULT;
DO $guard$
DECLARE missing text; role_name text;
BEGIN
 SELECT string_agg(expected.name, ', ') INTO missing
 FROM (VALUES ('id','text',true), ('usuario_id','text',true), ('paciente_id','text',true),
 ('tipo_test','text',true), ('nombre_test','text',false), ('modo','text',true),
 ('puntaje_total','integer',true), ('respuestas','jsonb',true),
 ('fecha_evaluacion','timestamp with time zone',true),
 ('creado_en','timestamp with time zone',true), ('version_baremo','text',true)) expected(name,type,required)
 LEFT JOIN pg_attribute a ON a.attrelid='mymind.evaluaciones_clinicas'::regclass
   AND a.attname=expected.name AND a.attnum>0 AND NOT a.attisdropped
 WHERE a.attname IS NULL OR format_type(a.atttypid,a.atttypmod)<>expected.type OR a.attnotnull<>expected.required;
 IF missing IS NOT NULL THEN
   RAISE EXCEPTION 'Assessment schema mismatch: %. Stop and review before recording migration history.',missing;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='mymind' AND tablename='evaluaciones_clinicas') THEN
   RAISE EXCEPTION 'Unexpected assessment RLS policy. This application authorizes access in its server API.';
 END IF;
 ALTER TABLE mymind.evaluaciones_clinicas ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON mymind.evaluaciones_clinicas FROM PUBLIC;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
     EXECUTE format('REVOKE ALL ON mymind.evaluaciones_clinicas FROM %I',role_name);
   END IF;
 END LOOP;
END $guard$;
