BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0));
CREATE TABLE IF NOT EXISTS mymind.schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());
DO $apply$
DECLARE previous text;
BEGIN
 SELECT checksum INTO previous FROM mymind.schema_migrations WHERE name='202610190002_patient_tags.sql';
 IF previous IS NOT NULL THEN
  IF previous<>'8342fa7cfbfe69adf26deb089c28031e8a688363f54ba47db1c3001948d70c6a' THEN RAISE EXCEPTION 'Migration checksum differs; stop and review.'; END IF;
 ELSE
 EXECUTE $tags$
ALTER TABLE mymind.pacientes ADD COLUMN IF NOT EXISTS etiquetas TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE mymind.pacientes SET etiquetas=ARRAY[]::TEXT[] WHERE etiquetas IS NULL;
ALTER TABLE mymind.pacientes ALTER COLUMN etiquetas SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE mymind.pacientes ALTER COLUMN etiquetas SET NOT NULL;
ALTER TABLE mymind.pacientes ADD CONSTRAINT pacientes_etiquetas_limit CHECK (cardinality(etiquetas)<=20 AND array_position(etiquetas,NULL) IS NULL);
COMMENT ON COLUMN mymind.pacientes.etiquetas IS 'Custom patient labels scoped through usuario_id. Empty array means no labels.';

$tags$;
 INSERT INTO mymind.schema_migrations(name,checksum) VALUES ('202610190002_patient_tags.sql','8342fa7cfbfe69adf26deb089c28031e8a688363f54ba47db1c3001948d70c6a');
 END IF;
END $apply$;
COMMIT;
