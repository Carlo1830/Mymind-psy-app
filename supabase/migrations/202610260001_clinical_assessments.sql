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
