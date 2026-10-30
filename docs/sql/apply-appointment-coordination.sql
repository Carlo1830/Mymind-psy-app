-- Generated from repository migration bytes. Run as postgres before deploying the app.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0));
DO $apply$
DECLARE expected jsonb:='[{"name":"202609240001_initial.sql","version":"202609240001","label":"initial","checksum":"4aef40c547ae306cd1526db04a89fb7912af9a94d601fbaea8f4779e90b8b285"},{"name":"202609250001_patient_archive.sql","version":"202609250001","label":"patient_archive","checksum":"c6ec434d5ae359af709835db9718550bc08471a16251e2d222d587699052d93f"},{"name":"202610190001_agenda_integrations.sql","version":"202610190001","label":"agenda_integrations","checksum":"63048a3f23e9a08d1abfc3398d514149e793f84fd88918f82853adfdb57108cb"},{"name":"202610190002_patient_tags.sql","version":"202610190002","label":"patient_tags","checksum":"8342fa7cfbfe69adf26deb089c28031e8a688363f54ba47db1c3001948d70c6a"},{"name":"202610190003_clinical_record.sql","version":"202610190003","label":"clinical_record","checksum":"f08c7566714c6b917998045eee1dc48e1e1f93675db006065d5d312c11e5493b"},{"name":"202610260001_clinical_assessments.sql","version":"202610260001","label":"clinical_assessments","checksum":"9dc0997392deb8f5783efbbe916b609a5c3c4381c494789f7c44c67c48ab714d"},{"name":"202610270001_reconcile_schema.sql","version":"202610270001","label":"reconcile_schema","checksum":"f0e10b9d2d4f2ad74dd5185816587ab1a9926cc2d1d847500a0feb4fdc7fccbf"},{"name":"202610280001_clinical_care.sql","version":"202610280001","label":"clinical_care","checksum":"16f52fc7771bfbb0d5ee3fdac3b8a9f54e5f30a83ee699f1e404c5402615bdb9"},{"name":"202610300001_appointment_coordination.sql","version":"202610300001","label":"appointment_coordination","checksum":"79b9f0962f279c218b6e51f4a55a88d933b522b4e228b3869d8414b9ea38fc18"}]'::jsonb; item jsonb; app_hash text; cli_name text; cli_sql text;
 source_sql text:=replace('-- Coordination is separate from clinical notes and email delivery.
ALTER TABLE mymind.sesiones DROP CONSTRAINT sesiones_estado_sesion_check;
ALTER TABLE mymind.sesiones ADD CONSTRAINT sesiones_estado_sesion_check CHECK(estado_sesion IN (''Programada'',''Realizada'',''Cancelada'',''Ausente''));
ALTER TABLE mymind.sesiones ADD COLUMN confirmacion_version INTEGER NOT NULL DEFAULT 0, ADD COLUMN serie_id TEXT, ADD COLUMN confirmada_en TIMESTAMPTZ, ADD COLUMN confirmacion_fuente TEXT CHECK(confirmacion_fuente IN (''paciente'',''profesional''));
CREATE INDEX sesiones_serie ON mymind.sesiones(serie_id) WHERE serie_id IS NOT NULL;
ALTER TABLE mymind.agenda_emails ADD COLUMN primer_intento_en TIMESTAMPTZ, ADD COLUMN proveedor_id TEXT UNIQUE, ADD COLUMN entrega TEXT NOT NULL DEFAULT ''sin_enviar'' CHECK(entrega IN (''sin_enviar'',''aceptado'',''entregado'',''rebotado'',''queja'')), ADD COLUMN entrega_en TIMESTAMPTZ, ADD COLUMN ultimo_error TEXT;
UPDATE mymind.agenda_emails SET entrega=''aceptado'' WHERE estado=''enviado'';
CREATE OR REPLACE FUNCTION mymind.agenda_state() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF NEW.estado_sesion=''Cancelada'' THEN NEW.estado_confirmacion:=''cancelada''; NEW.confirmada_en:=NULL; NEW.confirmacion_fuente:=NULL;
 ELSIF TG_OP=''UPDATE'' THEN
  IF NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora OR NEW.modalidad IS DISTINCT FROM OLD.modalidad OR NEW.duracion_minutos IS DISTINCT FROM OLD.duracion_minutos OR OLD.estado_sesion=''Cancelada'' THEN
   NEW.confirmacion_version:=OLD.confirmacion_version+1;
   NEW.estado_confirmacion:=''pendiente''; NEW.confirmada_en:=NULL; NEW.confirmacion_fuente:=NULL;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER agenda_state ON mymind.sesiones;
CREATE TRIGGER agenda_state BEFORE INSERT OR UPDATE ON mymind.sesiones FOR EACH ROW EXECUTE FUNCTION mymind.agenda_state();
CREATE OR REPLACE FUNCTION mymind.agenda_queue_email() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
DECLARE recipient TEXT; owner_id TEXT; enabled BOOLEAN; hours_before INTEGER; zone TEXT;
BEGIN
 IF TG_OP=''UPDATE'' THEN
  IF NEW.fecha_hora IS NOT DISTINCT FROM OLD.fecha_hora AND NEW.modalidad IS NOT DISTINCT FROM OLD.modalidad AND NEW.duracion_minutos IS NOT DISTINCT FROM OLD.duracion_minutos AND NEW.estado_sesion IS NOT DISTINCT FROM OLD.estado_sesion THEN RETURN NEW; END IF;
  UPDATE agenda_emails SET estado=''omitido'' WHERE sesion_id=NEW.id AND estado=''pendiente'';
 END IF;
 IF NEW.estado_sesion<>''Programada'' OR NEW.fecha_hora<=now() THEN RETURN NEW; END IF;
 SELECT p.email,p.usuario_id,u.recordatorios_email,u.recordatorio_horas,COALESCE(c.zona_horaria,''America/Santiago'')
 INTO recipient,owner_id,enabled,hours_before,zone FROM pacientes p JOIN usuarios u ON u.id=p.usuario_id
 LEFT JOIN configuracion_sitio c ON c.profesional_id=u.id WHERE p.id=NEW.paciente_id;
 IF enabled AND recipient IS NOT NULL AND recipient<>'''' THEN
 INSERT INTO agenda_emails(sesion_id,usuario_id,fecha_cita,tipo,destinatario,modalidad,zona_horaria,enviar_en)
 VALUES (NEW.id,owner_id,NEW.fecha_hora,''confirmacion'',recipient,NEW.modalidad,zone,now()),
 (NEW.id,owner_id,NEW.fecha_hora,''recordatorio'',recipient,NEW.modalidad,zone,GREATEST(now()+interval ''5 minutes'',NEW.fecha_hora-hours_before*interval ''1 hour''))
 ON CONFLICT(sesion_id,fecha_cita,tipo) DO UPDATE SET destinatario=excluded.destinatario,modalidad=excluded.modalidad,zona_horaria=excluded.zona_horaria,enviar_en=excluded.enviar_en,estado=''pendiente'',intentos=0,primer_intento_en=NULL,proveedor_id=NULL,entrega=''sin_enviar'',enviado_en=NULL,entrega_en=NULL,ultimo_error=NULL,creado_en=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER agenda_email ON mymind.sesiones;
CREATE TRIGGER agenda_email AFTER INSERT OR UPDATE OF fecha_hora,estado_sesion,modalidad,duracion_minutos ON mymind.sesiones FOR EACH ROW EXECUTE FUNCTION mymind.agenda_queue_email();
',chr(13)||chr(10),chr(10));
BEGIN
 IF EXISTS(SELECT 1 FROM mymind.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'name'=a.name))
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'version'=a.version)) THEN
 RAISE EXCEPTION 'Repository is missing applied migrations'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(expected) LOOP
  SELECT checksum INTO app_hash FROM mymind.schema_migrations WHERE name=item->>'name';
  SELECT name,array_to_string(statements,E';\n') INTO cli_name,cli_sql FROM supabase_migrations.schema_migrations WHERE version=item->>'version';
  IF item->>'name'<>'202610300001_appointment_coordination.sql' THEN
   IF app_hash IS DISTINCT FROM item->>'checksum' OR cli_name IS DISTINCT FROM item->>'label' OR cli_sql IS NULL THEN RAISE EXCEPTION 'Reconcile previous migration first: %',item->>'name'; END IF;
  ELSE
   IF app_hash IS NOT NULL OR cli_name IS NOT NULL THEN
    IF app_hash IS DISTINCT FROM item->>'checksum' OR cli_name IS DISTINCT FROM item->>'label' OR replace(cli_sql,chr(13)||chr(10),chr(10)) IS DISTINCT FROM source_sql THEN RAISE EXCEPTION 'Migration history mismatch: %',item->>'name'; END IF;
   ELSE
    IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=item->>'version') THEN RAISE EXCEPTION 'Reconcile CLI history first'; END IF;
    EXECUTE source_sql;
    INSERT INTO mymind.schema_migrations(name,checksum) VALUES(item->>'name',item->>'checksum');
    INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(item->>'version',item->>'label',ARRAY[source_sql]);
   END IF;
  END IF;
 END LOOP;
END $apply$;
COMMIT;
SELECT name,checksum FROM mymind.schema_migrations ORDER BY name;
