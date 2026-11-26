-- Generated from repository migration bytes. Run as postgres before deploying the app.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0));
DO $apply$
DECLARE expected jsonb:='[{"name":"202609240001_initial.sql","version":"202609240001","label":"initial","checksum":"4aef40c547ae306cd1526db04a89fb7912af9a94d601fbaea8f4779e90b8b285"},{"name":"202609250001_patient_archive.sql","version":"202609250001","label":"patient_archive","checksum":"c6ec434d5ae359af709835db9718550bc08471a16251e2d222d587699052d93f"},{"name":"202610190001_agenda_integrations.sql","version":"202610190001","label":"agenda_integrations","checksum":"63048a3f23e9a08d1abfc3398d514149e793f84fd88918f82853adfdb57108cb"},{"name":"202610190002_patient_tags.sql","version":"202610190002","label":"patient_tags","checksum":"8342fa7cfbfe69adf26deb089c28031e8a688363f54ba47db1c3001948d70c6a"},{"name":"202610190003_clinical_record.sql","version":"202610190003","label":"clinical_record","checksum":"f08c7566714c6b917998045eee1dc48e1e1f93675db006065d5d312c11e5493b"},{"name":"202610260001_clinical_assessments.sql","version":"202610260001","label":"clinical_assessments","checksum":"9dc0997392deb8f5783efbbe916b609a5c3c4381c494789f7c44c67c48ab714d"},{"name":"202610270001_reconcile_schema.sql","version":"202610270001","label":"reconcile_schema","checksum":"f0e10b9d2d4f2ad74dd5185816587ab1a9926cc2d1d847500a0feb4fdc7fccbf"},{"name":"202610280001_clinical_care.sql","version":"202610280001","label":"clinical_care","checksum":"16f52fc7771bfbb0d5ee3fdac3b8a9f54e5f30a83ee699f1e404c5402615bdb9"},{"name":"202610300001_appointment_coordination.sql","version":"202610300001","label":"appointment_coordination","checksum":"79b9f0962f279c218b6e51f4a55a88d933b522b4e228b3869d8414b9ea38fc18"},{"name":"202611200001_booking_requests.sql","version":"202611200001","label":"booking_requests","checksum":"fe0f6dff1ad694343f6f8d4adbefe9c93e3683bd52791bd9dcdb62d9736791bd"},{"name":"202611260001_patient_accounts.sql","version":"202611260001","label":"patient_accounts","checksum":"9d944d838d9a27c573e82775c6e0a28494d3ba733a41b4c61f1571ac57cb8897"}]'::jsonb; item jsonb; app_hash text; cli_name text; cli_sql text;
 source_sql text:=replace('-- Adult patient portal. Clinical records are not automatically published.
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
 tipo text NOT NULL CHECK(tipo IN (''invitacion'',''recuperacion'')),
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
 datos jsonb NOT NULL DEFAULT ''{}''::jsonb CHECK(jsonb_typeof(datos)=''object''),
 version integer NOT NULL DEFAULT 1,
 actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mymind.portal_documentos (
 id text PRIMARY KEY,
 paciente_id text NOT NULL,
 usuario_id text NOT NULL,
 titulo text NOT NULL CHECK(length(trim(titulo)) BETWEEN 1 AND 200),
 tipo text NOT NULL CHECK(tipo IN (''indicaciones'',''consentimiento'',''prontuario'',''informe'',''comprobante'')),
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
 tipo text NOT NULL CHECK(tipo IN (''acceso_prontuario'',''correccion'')),
 texto text NOT NULL CHECK(length(trim(texto)) BETWEEN 1 AND 3000),
 respuesta text,
 creado_en timestamptz NOT NULL DEFAULT now(),
 respondido_en timestamptz,
 FOREIGN KEY(paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT
);
CREATE TABLE mymind.portal_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 paciente_id text NOT NULL REFERENCES mymind.pacientes(id),
 actor text NOT NULL CHECK(actor IN (''profesional'',''paciente'',''sistema'')),
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
BEGIN RAISE EXCEPTION ''Portal audit events are append-only'' USING ERRCODE=''23514''; END $$;
CREATE TRIGGER portal_evento_inmutable BEFORE UPDATE OR DELETE ON mymind.portal_eventos
 FOR EACH ROW EXECUTE FUNCTION mymind.portal_evento_inmutable();
REVOKE ALL ON FUNCTION mymind.portal_evento_inmutable() FROM PUBLIC;
CREATE FUNCTION mymind.portal_cambio_identidad() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF lower(trim(NEW.email)) IS DISTINCT FROM lower(trim(OLD.email))
 OR (NEW.status=''archived'' AND NEW.status IS DISTINCT FROM OLD.status) THEN
  UPDATE portal_cuentas SET habilitado=false,version=version+1 WHERE paciente_id=NEW.id;
  IF FOUND THEN
   DELETE FROM portal_sesiones WHERE paciente_id=NEW.id;
   DELETE FROM portal_enlaces WHERE paciente_id=NEW.id;
   DELETE FROM accesos_paciente WHERE paciente_id=NEW.id;
   INSERT INTO portal_eventos(paciente_id,actor,accion) VALUES(NEW.id,''sistema'',''identidad_o_archivo_actualizado'');
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER portal_cambio_identidad AFTER UPDATE ON mymind.pacientes
 FOR EACH ROW EXECUTE FUNCTION mymind.portal_cambio_identidad();
REVOKE ALL ON FUNCTION mymind.portal_cambio_identidad() FROM PUBLIC;
',chr(13)||chr(10),chr(10));
BEGIN
 IF EXISTS(SELECT 1 FROM mymind.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'name'=a.name))
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'version'=a.version)) THEN
 RAISE EXCEPTION 'Repository is missing applied migrations'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(expected) LOOP
  SELECT checksum INTO app_hash FROM mymind.schema_migrations WHERE name=item->>'name';
  SELECT name,array_to_string(statements,E';\n') INTO cli_name,cli_sql FROM supabase_migrations.schema_migrations WHERE version=item->>'version';
  IF item->>'name'<>'202611260001_patient_accounts.sql' THEN
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
