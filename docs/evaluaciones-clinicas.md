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

### Verificación del 05-11-2026

La copia local se sincronizó con `origin/main` hasta `cebf229`. La consulta administrativa `npm run db:check` terminó correctamente: los nueve archivos de migración coinciden con ambos historiales de Supabase, las columnas consultadas de evaluaciones existen y las tablas verificadas tienen RLS activado. No se aplicó DDL ni se modificaron datos de producción. La indicación anterior «No se ha aplicado en producción» corresponde a la entrega original; esta comprobación posterior confirma el registro de la migración en ambos historiales.

Se comprobó el recorrido desde el navegador en una base temporal PGlite, usando una compilación local y un paciente sintético:

- PHQ-9 por puntaje directo: 12 el 01-11-2026 y 6 el 04-11-2026. Se guardaron ambos registros y el gráfico mostró los puntos en orden cronológico; la tabla mostró los más recientes primero.
- GAD-7 por ítems: siete respuestas de valor 2. Se guardó un total de 14 y se recuperó el detalle de las siete respuestas.
- El selector del gráfico mostró GAD-7 y PHQ-9 como series separadas. Al seleccionar PHQ-9, solo se mostraron los puntajes 12 y 6.
- Tras recargar la página y abrir nuevamente la ficha, los tres registros continuaban disponibles en la base temporal.

Pasaron `npm run lint`, `npm run typecheck`, las cuatro pruebas de `npm run db:test` y `npm run api:test`. La compilación local pasó con `npm run build -- --webpack`; el motor predeterminado Turbopack falló al iniciar su proceso de estilos en este entorno y no se considera validado.

Esta prueba de formulario no se ejecutó contra producción. No comprueba rendimiento ni entrega de correos.

### Repetir la comprobación manual sin datos reales

1. Compilar con `npm run build` o, si se reproduce el fallo local de Turbopack, `npm run build -- --webpack`.
2. Ejecutar `npm run evaluaciones:preview`.
3. Abrir `http://127.0.0.1:3190/acceso` e iniciar sesión con la cuenta sintética que imprime el comando. El paciente de prueba ya está creado.
4. Registrar evaluaciones desde la ficha, comprobar historial y gráfico y recargar la página para verificar recuperación.
5. Detener el comando con Ctrl+C. La base vive en memoria y se descarta al cerrar el proceso; la información no se conserva entre ejecuciones.

El comando usa una base temporal local, desactiva las credenciales de correo y escucha únicamente en `127.0.0.1`. No utiliza la conexión de producción para el servidor de prueba. Requiere libres los puertos 3190 y 55449.
