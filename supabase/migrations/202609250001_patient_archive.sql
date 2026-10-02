-- Compatible with an existing manually added status column.
ALTER TABLE mymind.pacientes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
UPDATE mymind.pacientes SET status = 'active' WHERE status IS NULL;
ALTER TABLE mymind.pacientes ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE mymind.pacientes ALTER COLUMN status SET NOT NULL;
ALTER TABLE mymind.pacientes ADD CONSTRAINT pacientes_status_valid CHECK (status IN ('active', 'archived'));
CREATE INDEX IF NOT EXISTS idx_pacientes_owner_status ON mymind.pacientes (usuario_id, status, fecha_registro DESC);
