-- Generated from repository migration bytes. Run as postgres before deploying the app.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0));
DO $apply$
DECLARE expected jsonb:='[{"name":"202609240001_initial.sql","version":"202609240001","label":"initial","checksum":"4aef40c547ae306cd1526db04a89fb7912af9a94d601fbaea8f4779e90b8b285"},{"name":"202609250001_patient_archive.sql","version":"202609250001","label":"patient_archive","checksum":"c6ec434d5ae359af709835db9718550bc08471a16251e2d222d587699052d93f"},{"name":"202610190001_agenda_integrations.sql","version":"202610190001","label":"agenda_integrations","checksum":"63048a3f23e9a08d1abfc3398d514149e793f84fd88918f82853adfdb57108cb"},{"name":"202610190002_patient_tags.sql","version":"202610190002","label":"patient_tags","checksum":"8342fa7cfbfe69adf26deb089c28031e8a688363f54ba47db1c3001948d70c6a"},{"name":"202610190003_clinical_record.sql","version":"202610190003","label":"clinical_record","checksum":"f08c7566714c6b917998045eee1dc48e1e1f93675db006065d5d312c11e5493b"},{"name":"202610260001_clinical_assessments.sql","version":"202610260001","label":"clinical_assessments","checksum":"9dc0997392deb8f5783efbbe916b609a5c3c4381c494789f7c44c67c48ab714d"},{"name":"202610270001_reconcile_schema.sql","version":"202610270001","label":"reconcile_schema","checksum":"f0e10b9d2d4f2ad74dd5185816587ab1a9926cc2d1d847500a0feb4fdc7fccbf"},{"name":"202610280001_clinical_care.sql","version":"202610280001","label":"clinical_care","checksum":"16f52fc7771bfbb0d5ee3fdac3b8a9f54e5f30a83ee699f1e404c5402615bdb9"}]'::jsonb; item jsonb; app_hash text; cli_name text; cli_sql text;
 source_sql text:=replace('-- Structured clinical care. Legacy patient fields and evolution notes are retained verbatim.
CREATE TABLE mymind.fichas_atencion (
 paciente_id text PRIMARY KEY, usuario_id text NOT NULL,
 datos jsonb NOT NULL DEFAULT ''{}''::jsonb CHECK(jsonb_typeof(datos)=''object''),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 actualizado_por text NOT NULL REFERENCES mymind.usuarios(id), actualizado_en timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT
);
CREATE TABLE mymind.objetivos_terapeuticos (
 id text PRIMARY KEY, paciente_id text NOT NULL, usuario_id text NOT NULL,
 titulo text NOT NULL CHECK(length(trim(titulo)) BETWEEN 1 AND 300), descripcion text, criterio_logro text,
 estado text NOT NULL DEFAULT ''activo'' CHECK(estado IN (''activo'',''logrado'',''pausado'')),
 fecha_revision date, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(),
 actualizado_por text NOT NULL REFERENCES mymind.usuarios(id),
 FOREIGN KEY(paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX sesiones_id_paciente_unique ON mymind.sesiones(id,paciente_id);
CREATE TABLE mymind.notas_clinicas (
 id text PRIMARY KEY, paciente_id text NOT NULL, usuario_id text NOT NULL, sesion_id text NOT NULL UNIQUE,
 contenido jsonb NOT NULL CHECK(jsonb_typeof(contenido)=''object''),
 estado text NOT NULL DEFAULT ''borrador'' CHECK(estado IN (''borrador'',''finalizada'')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(),
 creado_por text NOT NULL REFERENCES mymind.usuarios(id), actualizado_por text NOT NULL REFERENCES mymind.usuarios(id),
 finalizada_en timestamptz, finalizada_por text REFERENCES mymind.usuarios(id),
 CHECK((estado=''borrador'' AND finalizada_en IS NULL AND finalizada_por IS NULL) OR (estado=''finalizada'' AND finalizada_en IS NOT NULL AND finalizada_por IS NOT NULL)),
 FOREIGN KEY(paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT,
 FOREIGN KEY(sesion_id,paciente_id) REFERENCES mymind.sesiones(id,paciente_id) ON DELETE RESTRICT
);
CREATE TABLE mymind.nota_revisiones (
 nota_id text NOT NULL REFERENCES mymind.notas_clinicas(id) ON DELETE RESTRICT, version integer NOT NULL,
 contenido jsonb NOT NULL, estado text NOT NULL, autor_id text NOT NULL REFERENCES mymind.usuarios(id),
 registrado_en timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(nota_id,version)
);
CREATE TABLE mymind.nota_adendas (
 id text PRIMARY KEY, nota_id text NOT NULL REFERENCES mymind.notas_clinicas(id) ON DELETE RESTRICT,
 texto text NOT NULL CHECK(length(trim(texto)) BETWEEN 1 AND 10000),
 autor_id text NOT NULL REFERENCES mymind.usuarios(id), registrado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mymind.atencion_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 paciente_id text NOT NULL, usuario_id text NOT NULL, actor_id text NOT NULL REFERENCES mymind.usuarios(id),
 accion text NOT NULL, recurso_id text, version integer, registrado_en timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT
);
CREATE INDEX objetivos_patient ON mymind.objetivos_terapeuticos(usuario_id,paciente_id,creado_en);
CREATE INDEX notas_patient ON mymind.notas_clinicas(usuario_id,paciente_id,creado_en DESC);
CREATE INDEX eventos_patient ON mymind.atencion_eventos(usuario_id,paciente_id,id DESC);
CREATE FUNCTION mymind.nota_ciclo_vida() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF TG_OP=''DELETE'' THEN RAISE EXCEPTION ''Clinical notes cannot be deleted'' USING ERRCODE=''23514''; END IF;
 IF TG_OP=''UPDATE'' THEN
  IF OLD.estado=''finalizada'' THEN RAISE EXCEPTION ''Finalized note is immutable; append an addendum'' USING ERRCODE=''23514''; END IF;
  IF (NEW.id,NEW.paciente_id,NEW.usuario_id,NEW.sesion_id,NEW.creado_en,NEW.creado_por) IS DISTINCT FROM (OLD.id,OLD.paciente_id,OLD.usuario_id,OLD.sesion_id,OLD.creado_en,OLD.creado_por) THEN RAISE EXCEPTION ''Note identity is immutable'' USING ERRCODE=''23514''; END IF;
  NEW.version:=OLD.version+1;
 ELSE
  IF NEW.estado<>''borrador'' THEN RAISE EXCEPTION ''Create a draft first'' USING ERRCODE=''23514''; END IF;
  NEW.version:=1; NEW.creado_en:=now();
 END IF;
 NEW.actualizado_en:=now();
 IF NEW.actualizado_por<>NEW.usuario_id OR NEW.creado_por<>NEW.usuario_id THEN RAISE EXCEPTION ''Note author must own the patient'' USING ERRCODE=''23514''; END IF;
 IF NEW.estado=''finalizada'' THEN
  PERFORM 1 FROM sesiones WHERE id=NEW.sesion_id AND paciente_id=NEW.paciente_id AND estado_sesion=''Realizada'' AND fecha_hora::timestamptz<=now() FOR UPDATE;
  IF NOT FOUND OR coalesce(trim(NEW.contenido->>''resumen''),'''')='''' THEN RAISE EXCEPTION ''Finalization requires a completed session and summary'' USING ERRCODE=''23514''; END IF;
  NEW.finalizada_en:=now(); NEW.finalizada_por:=NEW.actualizado_por;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER nota_ciclo_vida BEFORE INSERT OR UPDATE OR DELETE ON mymind.notas_clinicas FOR EACH ROW EXECUTE FUNCTION mymind.nota_ciclo_vida();
CREATE FUNCTION mymind.nota_guardar_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 INSERT INTO nota_revisiones(nota_id,version,contenido,estado,autor_id) VALUES(NEW.id,NEW.version,NEW.contenido,NEW.estado,NEW.actualizado_por);
 RETURN NEW;
END $$;
CREATE TRIGGER nota_revision AFTER INSERT OR UPDATE ON mymind.notas_clinicas FOR EACH ROW EXECUTE FUNCTION mymind.nota_guardar_revision();
CREATE FUNCTION mymind.historial_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION ''Append-only clinical history'' USING ERRCODE=''23514''; END $$;
CREATE TRIGGER revisiones_inmutables BEFORE UPDATE OR DELETE ON mymind.nota_revisiones FOR EACH ROW EXECUTE FUNCTION mymind.historial_inmutable();
CREATE TRIGGER adendas_inmutables BEFORE UPDATE OR DELETE ON mymind.nota_adendas FOR EACH ROW EXECUTE FUNCTION mymind.historial_inmutable();
CREATE TRIGGER eventos_inmutables BEFORE UPDATE OR DELETE ON mymind.atencion_eventos FOR EACH ROW EXECUTE FUNCTION mymind.historial_inmutable();
CREATE FUNCTION mymind.validar_adenda() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM notas_clinicas WHERE id=NEW.nota_id AND estado=''finalizada'' AND usuario_id=NEW.autor_id) THEN RAISE EXCEPTION ''Addendum requires a finalized note owned by its author'' USING ERRCODE=''23514''; END IF;
 NEW.registrado_en:=now(); RETURN NEW;
END $$;
CREATE TRIGGER adenda_validar BEFORE INSERT ON mymind.nota_adendas FOR EACH ROW EXECUTE FUNCTION mymind.validar_adenda();
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY[''fichas_atencion'',''objetivos_terapeuticos'',''notas_clinicas'',''nota_revisiones'',''nota_adendas'',''atencion_eventos''] LOOP
  EXECUTE format(''ALTER TABLE mymind.%I ENABLE ROW LEVEL SECURITY'',t);
  EXECUTE format(''REVOKE ALL ON mymind.%I FROM PUBLIC'',t);
  FOREACH r IN ARRAY ARRAY[''anon'',''authenticated''] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format(''REVOKE ALL ON mymind.%I FROM %I'',t,r); END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION mymind.sesion_finalizada_inmutable() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF (NEW.paciente_id,NEW.fecha_hora,NEW.duracion_minutos,NEW.modalidad,NEW.estado_sesion) IS DISTINCT FROM (OLD.paciente_id,OLD.fecha_hora,OLD.duracion_minutos,OLD.modalidad,OLD.estado_sesion) AND EXISTS(SELECT 1 FROM notas_clinicas WHERE sesion_id=OLD.id AND estado=''finalizada'') THEN RAISE EXCEPTION ''Session has a finalized clinical note'' USING ERRCODE=''23514''; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sesion_finalizada_inmutable BEFORE UPDATE ON mymind.sesiones FOR EACH ROW EXECUTE FUNCTION mymind.sesion_finalizada_inmutable();
CREATE FUNCTION mymind.expediente_trazabilidad() RETURNS trigger LANGUAGE plpgsql SET search_path=mymind,pg_temp AS $$
BEGIN
 IF (NEW.motivo_consulta,NEW.antecedentes,NEW.hipotesis_diagnostica,NEW.notas_confidenciales) IS DISTINCT FROM (OLD.motivo_consulta,OLD.antecedentes,OLD.hipotesis_diagnostica,OLD.notas_confidenciales) THEN
 INSERT INTO atencion_eventos(paciente_id,usuario_id,actor_id,accion,recurso_id,version) VALUES(NEW.id,NEW.usuario_id,NEW.usuario_id,''expediente_actualizado'',NEW.id,NEW.expediente_version);
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER expediente_trazabilidad AFTER UPDATE ON mymind.pacientes FOR EACH ROW EXECUTE FUNCTION mymind.expediente_trazabilidad();
',chr(13)||chr(10),chr(10));
BEGIN
 IF EXISTS(SELECT 1 FROM mymind.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'name'=a.name))
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'version'=a.version)) THEN
 RAISE EXCEPTION 'Repository is missing applied migrations'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(expected) LOOP
  SELECT checksum INTO app_hash FROM mymind.schema_migrations WHERE name=item->>'name';
  SELECT name,array_to_string(statements,E';\n') INTO cli_name,cli_sql FROM supabase_migrations.schema_migrations WHERE version=item->>'version';
  IF item->>'name'<>'202610280001_clinical_care.sql' THEN
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
