# Expediente clínico estructurado

## Secciones
Motivo de consulta (campo existente), Antecedentes, Hipótesis diagnóstica / Formulación clínica y Notas de evolución (sesiones existentes, orden descendente por fecha).
Las primeras tres secciones se editan en bloques colapsables dentro de la ficha, mediante Actualizar expediente. No hay autoguardado. Un error conserva el borrador en pantalla.

## Migración
supabase/migrations/202610190003_clinical_record.sql añade antecedentes TEXT, hipotesis_diagnostica TEXT y expediente_version INTEGER NOT NULL DEFAULT 0 a mymind.pacientes.
Copia notas_confidenciales literalmente a antecedentes solo cuando este está vacío; no elimina la columna original ni sobrescribe antecedentes existentes. Las notas originales siguen consultables dentro de Antecedentes.
No transforma texto clínico ni interpreta diagnósticos. No modifica sesiones ni notas de evolución.
Los pacientes nuevos creados por el formulario anterior también copian sus notas iniciales a antecedentes mediante trigger.
En el formulario general las notas originales de pacientes existentes son de solo lectura; la edición clínica se hace en el expediente.

## Aplicación en Supabase
Antes de desplegar, ejecutar npm run db:migrate. Alternativa: copiar completo docs/sql/aplicar-expediente-clinico.sql en SQL Editor y ejecutar como postgres. El script usa transacción, bloqueo y registro de checksum; una segunda ejecución con la misma migración no la repite.
No se ha ejecutado en producción. Si hay aplicación manual parcial o checksum diferente, revisar el estado antes de reintentar, sin borrar datos.
La lectura es compatible con esquema previo: muestra las notas libres como antecedentes. Guardar los campos estructurados requiere la migración y devuelve 503 si falta esquema.

## API y privacidad
PUT /api/pacientes/:id/expediente acepta motivo_consulta (hasta 10000), antecedentes (hasta 20000), hipotesis_diagnostica (hasta 20000) y expediente_version.
Requiere sesión, validación de origen y propiedad por usuario_id. No acepta cambiar propietario, etiquetas, estado ni sesiones. Los campos clínicos no se añaden al listado ni a sugerencias.
El trigger incrementa la versión cuando cambia cualquier campo clínico, incluso desde el formulario general. Si otra edición cambió el expediente, devuelve 409 y conserva el borrador del editor; el profesional debe revisar la ficha actual antes de guardar.
Vaciar un campo lo guarda como NULL sin restaurar automáticamente las notas originales.

## Pruebas
Validación de campos, aislamiento entre profesionales, conflicto de edición, preservación de notas originales/sesiones, fallback sin migración y script del editor ejecutado dos veces en PostgreSQL aislado.
