ALTER TABLE mymind.pacientes ADD COLUMN IF NOT EXISTS etiquetas TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE mymind.pacientes SET etiquetas=ARRAY[]::TEXT[] WHERE etiquetas IS NULL;
ALTER TABLE mymind.pacientes ALTER COLUMN etiquetas SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE mymind.pacientes ALTER COLUMN etiquetas SET NOT NULL;
ALTER TABLE mymind.pacientes ADD CONSTRAINT pacientes_etiquetas_limit CHECK (cardinality(etiquetas)<=20 AND array_position(etiquetas,NULL) IS NULL);
COMMENT ON COLUMN mymind.pacientes.etiquetas IS 'Custom patient labels scoped through usuario_id. Empty array means no labels.';
