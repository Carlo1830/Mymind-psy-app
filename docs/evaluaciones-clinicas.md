# Evaluaciones clínicas

## Modelo y despliegue
Migración: supabase/migrations/202610260001_clinical_assessments.sql.
Tabla mymind.evaluaciones_clinicas: id, usuario_id, paciente_id, tipo_test, nombre_test, modo, puntaje_total, respuestas JSONB, fecha_evaluacion TIMESTAMPTZ, creado_en y version_baremo.
FK compuesta (paciente_id, usuario_id) impide asociar una evaluación a un paciente de otro profesional. RLS activado, sin políticas públicas; el backend PostgreSQL comprueba sesión y usuario_id en cada operación. Ningún dato clínico se envía a servicios externos.
Aplicar npm run db:migrate antes de desplegar; alternativamente copiar completo docs/sql/aplicar-evaluaciones-clinicas.sql en Supabase SQL Editor y ejecutar como postgres. Script transaccional con historial/checksum; si hay aplicación manual parcial, revisar el error antes de continuar. No modifica pacientes ni expedientes existentes. No se ha aplicado en producción.
Si falta la tabla, se muestra el error de esquema y se mantiene accesible el resto de la ficha.

## Registro
POST y GET /api/pacientes/:id/evaluaciones.
POST requiere UUID id de registro, tipo_test, modo y fecha_evaluacion ISO UTC no futura.
- puntaje: entero 0–27 PHQ-9, 0–21 GAD-7; respuestas vacío.
- respuestas: 9 o 7 objetos {item: 1..N, valor: 0..3}; completos y ordenados. El servidor recalcula el total y no confía en puntaje_total enviado.
- Personalizado: nombre obligatorio de hasta 100 caracteres, solo puntaje directo 0–10000 (límite técnico), severidad Sin baremo. No se deduce un baremo personalizado.
Los registros son históricos; esta entrega no permite modificar ni borrar evaluaciones. Reintentar el mismo id y contenido devuelve el registro existente; cambiar el contenido con ese id produce 409.

## Uso clínico
La entrada por ítems es transcripción de un instrumento validado aplicado al paciente, no una traducción/reformulación del cuestionario. Usar su redacción y opciones originales. El periodo de referencia de PHQ-9 y GAD-7 son las últimas dos semanas.
PHQ-9: 0–4 Mínimo, 5–9 Leve, 10–14 Moderado, 15–19 Moderadamente severo, 20–27 Severo.
GAD-7: 0–4 Mínimo, 5–9 Leve, 10–14 Moderado, 15–21 Severo.
Estos niveles describen severidad de síntomas y no equivalen a un diagnóstico.
PHQ-9 ítem 9 > 0 muestra aviso para valoración clínica específica del riesgo, independientemente del total. El total directo no permite evaluar ese ítem. No se generan recomendaciones de tratamiento automáticas.

## Historial y gráfico
Listado descendente por fecha con detalle de respuestas y modo de registro. Gráfico ascendente con separación por tipo y, en Personalizado, por nombre exacto. No mezcla escalas. Eje X ordinal de evaluaciones, intervalos uniformes; fechas en tabla y extremos. Eje Y fijo 0–27/0–21; personalizado usa máximo observado. Un registro muestra solo un punto. Fechas se muestran en zona horaria del dispositivo; se guardan en UTC.
Incluye descripción accesible del gráfico y tabla de datos.

## Fuentes clínicas consultadas
- PHQ-9: University of Washington, National HIV Curriculum: https://www.hiv.uw.edu/page/mental-health-screening/phq-9
- GAD-7: Institut national de santé publique du Québec: https://www.inspq.qc.ca/en/post-disaster-mental-health-impacts-surveillance-toolkit/standardized-measurement-instruments/information-sheets-standardized-measurement-instruments-recommended/anxiety-symptoms
- GAD-7 instrumento/periodo: https://www.hiv.uw.edu/page/mental-health-screening/gad-7

## Verificaciones
Pruebas de límites, cálculo servidor, validación de ítems/fecha, CSRF, aislamiento, FK de propietario, reintentos, orden y script SQL aplicado dos veces en base aislada.
