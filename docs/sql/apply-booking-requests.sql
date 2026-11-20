-- Generated from repository migration bytes. Run as postgres before deploying the app.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0));
DO $apply$
DECLARE expected jsonb:='[{"name":"202609240001_initial.sql","version":"202609240001","label":"initial","checksum":"4aef40c547ae306cd1526db04a89fb7912af9a94d601fbaea8f4779e90b8b285"},{"name":"202609250001_patient_archive.sql","version":"202609250001","label":"patient_archive","checksum":"c6ec434d5ae359af709835db9718550bc08471a16251e2d222d587699052d93f"},{"name":"202610190001_agenda_integrations.sql","version":"202610190001","label":"agenda_integrations","checksum":"63048a3f23e9a08d1abfc3398d514149e793f84fd88918f82853adfdb57108cb"},{"name":"202610190002_patient_tags.sql","version":"202610190002","label":"patient_tags","checksum":"8342fa7cfbfe69adf26deb089c28031e8a688363f54ba47db1c3001948d70c6a"},{"name":"202610190003_clinical_record.sql","version":"202610190003","label":"clinical_record","checksum":"f08c7566714c6b917998045eee1dc48e1e1f93675db006065d5d312c11e5493b"},{"name":"202610260001_clinical_assessments.sql","version":"202610260001","label":"clinical_assessments","checksum":"9dc0997392deb8f5783efbbe916b609a5c3c4381c494789f7c44c67c48ab714d"},{"name":"202610270001_reconcile_schema.sql","version":"202610270001","label":"reconcile_schema","checksum":"f0e10b9d2d4f2ad74dd5185816587ab1a9926cc2d1d847500a0feb4fdc7fccbf"},{"name":"202610280001_clinical_care.sql","version":"202610280001","label":"clinical_care","checksum":"16f52fc7771bfbb0d5ee3fdac3b8a9f54e5f30a83ee699f1e404c5402615bdb9"},{"name":"202610300001_appointment_coordination.sql","version":"202610300001","label":"appointment_coordination","checksum":"79b9f0962f279c218b6e51f4a55a88d933b522b4e228b3869d8414b9ea38fc18"},{"name":"202611200001_booking_requests.sql","version":"202611200001","label":"booking_requests","checksum":"fe0f6dff1ad694343f6f8d4adbefe9c93e3683bd52791bd9dcdb62d9736791bd"}]'::jsonb; item jsonb; app_hash text; cli_name text; cli_sql text;
 source_sql text:=replace('ALTER TABLE mymind.usuarios
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
 modalidad text NOT NULL CHECK (modalidad IN (''Presencial'',''Online'')),
 estado text NOT NULL DEFAULT ''pendiente'' CHECK (estado IN (''pendiente'',''aceptada'',''rechazada'',''alternativa'',''vencida'')),
 creado_en timestamptz NOT NULL DEFAULT now(),
 vence_en timestamptz NOT NULL,
 respondido_en timestamptz,
 sesion_id text UNIQUE REFERENCES mymind.sesiones(id) ON DELETE RESTRICT,
 seguimiento_hash text NOT NULL UNIQUE,
 contenido_hash text NOT NULL,
 mensaje text NOT NULL DEFAULT '''',
 alternativa_horario_id text,
 alternativa_fecha timestamptz,
 alternativa_modalidad text,
 alternativa_duracion integer,
 FOREIGN KEY (paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT,
 CHECK (vence_en > creado_en),
 CHECK ((estado=''aceptada'') = (sesion_id IS NOT NULL))
);
CREATE INDEX solicitudes_pendientes ON mymind.solicitudes_cita(usuario_id,fecha_hora,vence_en) WHERE estado=''pendiente'';
CREATE INDEX solicitudes_paciente ON mymind.solicitudes_cita(paciente_id,creado_en DESC);
CREATE TABLE mymind.avisos_solicitudes (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 solicitud_id text NOT NULL REFERENCES mymind.solicitudes_cita(id) ON DELETE RESTRICT,
 tipo text NOT NULL,
 destinatario text NOT NULL,
 estado text NOT NULL DEFAULT ''pendiente'' CHECK (estado IN (''pendiente'',''aceptado'',''fallido'',''omitido'')),
 intentos integer NOT NULL DEFAULT 0,
 enviar_en timestamptz NOT NULL DEFAULT now(),
 creado_en timestamptz NOT NULL DEFAULT now(),
 proveedor_id text,
 UNIQUE(solicitud_id,tipo)
);
CREATE INDEX avisos_solicitudes_cola ON mymind.avisos_solicitudes(enviar_en) WHERE estado=''pendiente'';
ALTER TABLE mymind.accesos_paciente ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.solicitudes_cita ENABLE ROW LEVEL SECURITY;
ALTER TABLE mymind.avisos_solicitudes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mymind.accesos_paciente,mymind.solicitudes_cita,mymind.avisos_solicitudes FROM PUBLIC;

CREATE FUNCTION mymind.solicitud_avisos() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
DECLARE recipient text;
BEGIN
 IF TG_OP=''INSERT'' THEN
  SELECT email INTO recipient FROM usuarios WHERE id=NEW.usuario_id;
  IF recipient IS NOT NULL AND recipient<>'''' THEN
   INSERT INTO avisos_solicitudes(solicitud_id,tipo,destinatario) VALUES(NEW.id,''nueva'',recipient) ON CONFLICT DO NOTHING;
  END IF;
 ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
  SELECT email INTO recipient FROM pacientes WHERE id=NEW.paciente_id;
  IF recipient IS NOT NULL AND recipient<>'''' THEN
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
   WHERE estado=''pendiente'' AND vence_en<=now() AND (p_usuario IS NULL OR usuario_id=p_usuario) ORDER BY usuario_id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id,0));
  UPDATE solicitudes_cita SET estado=''vencida'',respondido_en=now()
   WHERE usuario_id=owner_id AND estado=''pendiente'' AND vence_en<=now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  total := total + affected;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION mymind.vencer_solicitudes(text),mymind.solicitud_avisos() FROM PUBLIC;
',chr(13)||chr(10),chr(10));
BEGIN
 IF EXISTS(SELECT 1 FROM mymind.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'name'=a.name))
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'version'=a.version)) THEN
 RAISE EXCEPTION 'Repository is missing applied migrations'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(expected) LOOP
  SELECT checksum INTO app_hash FROM mymind.schema_migrations WHERE name=item->>'name';
  SELECT name,array_to_string(statements,E';\n') INTO cli_name,cli_sql FROM supabase_migrations.schema_migrations WHERE version=item->>'version';
  IF item->>'name'<>'202611200001_booking_requests.sql' THEN
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
