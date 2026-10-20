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
