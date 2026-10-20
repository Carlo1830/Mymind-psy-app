BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0));
CREATE TABLE IF NOT EXISTS mymind.schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());
DO $apply$
DECLARE previous text;
BEGIN
 SELECT checksum INTO previous FROM mymind.schema_migrations WHERE name='202610190003_clinical_record.sql';
 IF previous IS NOT NULL THEN
  IF previous<>'f08c7566714c6b917998045eee1dc48e1e1f93675db006065d5d312c11e5493b' THEN RAISE EXCEPTION 'Migration checksum differs; stop and review.'; END IF;
 ELSE
 EXECUTE $record$
ALTER TABLE mymind.pacientes
 ADD COLUMN IF NOT EXISTS antecedentes TEXT,
 ADD COLUMN IF NOT EXISTS hipotesis_diagnostica TEXT,
 ADD COLUMN IF NOT EXISTS expediente_version INTEGER NOT NULL DEFAULT 0;
-- Preserve the original notes verbatim. Never overwrite existing structured history.
UPDATE mymind.pacientes SET antecedentes=notas_confidenciales
 WHERE (antecedentes IS NULL OR antecedentes='') AND notas_confidenciales IS NOT NULL;
CREATE FUNCTION mymind.expediente_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER expediente_version BEFORE INSERT OR UPDATE ON mymind.pacientes
 FOR EACH ROW EXECUTE FUNCTION mymind.expediente_version_update();
COMMENT ON COLUMN mymind.pacientes.antecedentes IS 'Clinical history; legacy notes copied without deleting their original.';

$record$;
 INSERT INTO mymind.schema_migrations(name,checksum) VALUES ('202610190003_clinical_record.sql','f08c7566714c6b917998045eee1dc48e1e1f93675db006065d5d312c11e5493b');
 END IF;
END $apply$;
COMMIT;
