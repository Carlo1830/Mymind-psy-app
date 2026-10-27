BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0));
CREATE TABLE IF NOT EXISTS mymind.schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());
DO $apply$
DECLARE previous text;
BEGIN
 SELECT checksum INTO previous FROM mymind.schema_migrations WHERE name='202610260001_clinical_assessments.sql';
 IF previous IS NOT NULL THEN
  IF previous<>'9dc0997392deb8f5783efbbe916b609a5c3c4381c494789f7c44c67c48ab714d' THEN RAISE EXCEPTION 'Migration checksum differs; stop and review.'; END IF;
 ELSE
 EXECUTE $assessments$
CREATE UNIQUE INDEX IF NOT EXISTS pacientes_id_usuario_unique ON mymind.pacientes(id,usuario_id);
CREATE TABLE mymind.evaluaciones_clinicas (
 id TEXT PRIMARY KEY,
 usuario_id TEXT NOT NULL REFERENCES mymind.usuarios(id) ON DELETE RESTRICT,
 paciente_id TEXT NOT NULL,
 tipo_test TEXT NOT NULL CHECK(tipo_test IN ('PHQ-9','GAD-7','Personalizado')),
 nombre_test TEXT,
 modo TEXT NOT NULL CHECK(modo IN ('respuestas','puntaje')),
 puntaje_total INTEGER NOT NULL,
 respuestas JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(respuestas)='array'),
 fecha_evaluacion TIMESTAMPTZ NOT NULL,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 version_baremo TEXT NOT NULL DEFAULT 'phq-gad-cutoffs-v1',
 FOREIGN KEY(paciente_id,usuario_id) REFERENCES mymind.pacientes(id,usuario_id) ON DELETE RESTRICT,
 CHECK((tipo_test='PHQ-9' AND puntaje_total BETWEEN 0 AND 27) OR (tipo_test='GAD-7' AND puntaje_total BETWEEN 0 AND 21) OR (tipo_test='Personalizado' AND puntaje_total BETWEEN 0 AND 10000)),
 CHECK((tipo_test='Personalizado' AND nombre_test IS NOT NULL AND length(trim(nombre_test)) BETWEEN 1 AND 100 AND modo='puntaje') OR (tipo_test<>'Personalizado' AND nombre_test IS NULL)),
 CHECK((modo='puntaje' AND jsonb_array_length(respuestas)=0) OR (modo='respuestas' AND jsonb_array_length(respuestas)=CASE WHEN tipo_test='PHQ-9' THEN 9 WHEN tipo_test='GAD-7' THEN 7 ELSE -1 END))
);
ALTER TABLE mymind.evaluaciones_clinicas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mymind.evaluaciones_clinicas FROM PUBLIC;
CREATE INDEX evaluaciones_owner_patient_date ON mymind.evaluaciones_clinicas(usuario_id,paciente_id,fecha_evaluacion DESC,id);

$assessments$;
 INSERT INTO mymind.schema_migrations(name,checksum) VALUES ('202610260001_clinical_assessments.sql','9dc0997392deb8f5783efbbe916b609a5c3c4381c494789f7c44c67c48ab714d');
 END IF;
END $apply$;
COMMIT;
