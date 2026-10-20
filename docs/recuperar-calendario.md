# Recuperar Calendario tras desplegar Fase 1

## Consultas revisadas
- GET /api/sesiones y respuestas de POST/PUT: consultaban directamente mymind.sesiones.estado_confirmacion. Sin esa columna PostgreSQL devuelve 42703.
- GET/PUT /api/agenda/ajustes: requieren sync_enabled, recordatorios_email, recordatorios_whatsapp y recordatorio_horas en mymind.usuarios.
- El worker requiere mymind.agenda_emails.
- GET /api/disponibilidad usa reglas_disponibilidad, disponibilidad_publica y configuracion_sitio del esquema inicial. La ausencia exclusiva de Fase 1 no debe romper esta ruta.

## Supabase SQL Editor
1. Seleccionar el proyecto usado por DATABASE_URL de producción.
2. Abrir SQL Editor > New query.
3. Copiar TODO docs/sql/aplicar-agenda-fase1.sql y ejecutar como postgres.
4. Comprobar que termina sin errores. Si ya estaba aplicada y el checksum coincide, no vuelve a ejecutarla.
5. Recargar Calendario y revisar por separado /api/sesiones, /api/disponibilidad y /api/agenda/ajustes en Network.
6. Desplegar los cambios de compatibilidad de este proyecto para disponer del fallback y de los mensajes específicos.

El script requiere el esquema inicial existente. Si alguien aplicó solo partes manualmente sin registrar la migración, o el checksum difiere, detenerse y revisar el esquema antes de repetir; la transacción revierte el intento fallido. No borrar datos ni modificar el historial de migraciones para forzar su ejecución.

## Compatibilidad implementada
El listado y las respuestas de creación/edición obtienen el estado opcional con to_jsonb(s)->>'estado_confirmacion', con pendiente/cancelada como fallback. Así no se referencia una columna inexistente. Los ajustes avanzados devuelven 503 con el nombre exacto de la migración pendiente, sin fingir que se guardaron preferencias. Errores PostgreSQL de tabla/columna/función ausente devuelven SCHEMA_NOT_READY; los logs solo registran SQLSTATE, sin consultas ni datos clínicos.

## Validación
Base aislada sin Fase 1: lectura, alta, edición, disponibilidad y aviso de migración. Después se ejecutó el script del editor dos veces y se verificó la recuperación de ajustes y estados. No se ha ejecutado este script en producción.
