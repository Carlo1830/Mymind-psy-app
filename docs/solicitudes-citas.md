# Solicitudes de citas

Implementación del 20-11-2026. Sustituye la reserva pública inmediata por una solicitud que debe responder la profesional.

Actualización del 26-11-2026: los pacientes adultos también pueden agendar desde una cuenta con correo y contraseña. Ver [Portal de pacientes adultos](portal-pacientes.md). Los enlaces de esta guía son el recorrido anterior, limitado a citas.

## Recorrido

1. En Pacientes, la profesional genera un enlace privado de agenda para un paciente activo. El enlace dura 30 días; renovarlo invalida el anterior. Puede revocarlo. Es una credencial: compartirlo solo con su titular. No se envía automáticamente.
2. El paciente abre el enlace y elige entre los horarios publicados. Por defecto necesita 24 horas de anticipación. No accede a notas clínicas ni a otras fichas.
3. La solicitud retiene el horario durante seis horas continuas desde su creación, incluidas noches y fines de semana. No crea una sesión todavía.
4. En Inicio, la profesional confirma, rechaza o propone otro horario. Confirmar crea una sola sesión programada. Rechazar libera el horario. La propuesta libera el original y no retiene la alternativa: el paciente debe solicitarla si todavía está disponible.
5. Sin respuesta dentro del plazo, vence la solicitud y se libera el horario. El paciente consulta el resultado en su enlace. Si después se cancela o modifica la sesión confirmada, el portal muestra el estado y los datos actuales de esa sesión.

En Calendario se modifican los dos plazos. La anticipación debe superar el plazo de respuesta. Los cambios afectan solicitudes nuevas; las anteriores conservan su vencimiento.

Los primeros contactos de la web pública también generan solicitudes pendientes. Reciben un enlace de seguimiento de esa solicitud. Si ya existe una ficha con ese correo, deben pedir su enlace privado a la profesional.

## Base de datos y operación

- Migración: `202611200001_booking_requests.sql`. Añade solicitudes, accesos por hash y cola de avisos, con RLS y sin permisos de PUBLIC. No cambia las notas clínicas existentes.
- Aplicación por SQL Editor: `node scripts/generate-migration-sql.mjs docs/sql/apply-booking-requests.sql`. El archivo comprueba ambos historiales, aplica la última migración en una transacción y permite repetirla sin duplicarla.
- Tras aplicar, ejecutar `docs/sql/schedule-booking-expiry.sql` como postgres. Usa [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart), con un trabajo cada minuto. La disponibilidad y la confirmación comprueban el vencimiento exacto, aunque el trabajo todavía no haya cambiado el estado almacenado.
- Supervisión: `SELECT status,return_message,start_time FROM cron.job_run_details WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='emnos-vencer-solicitudes') ORDER BY start_time DESC LIMIT 10;` Revisar periódicamente el tamaño del historial de ejecuciones y definir su retención.
- Las escrituras usan el mismo bloqueo por profesional que la agenda para evitar solapamientos y confirmaciones duplicadas.
- Los enlaces llevan el token en el fragmento; las API lo reciben en una cabecera y solo guardan SHA-256. Las páginas privadas tienen noindex y no-referrer. Quien posea el enlace puede usarlo mientras esté vigente. No equivale a una cuenta de paciente con contraseña.

## Avisos externos y pagos pendientes

La bandeja de la aplicación funciona sin proveedor externo. La cola almacena avisos de solicitud nueva para la profesional y de respuesta/vencimiento para el paciente. El envío por Resend necesita `RESEND_API_KEY`, `EMAIL_FROM` verificado y `APP_ORIGIN`. Todavía se deben configurar la cuenta y el dominio. No se ha probado una entrega real. WhatsApp automático no está integrado.

Las acciones intentan despachar la cola después de responder. `/api/agenda/recordatorios`, protegido por `CRON_SECRET`, procesa también estos avisos y los vencimientos. Al activar el correo, comprobar y programar este endpoint para los reintentos y avisos de vencimiento sin depender de visitas. El trabajo SQL de vencimiento no envía correos.

Se reintenta un envío fallido hasta cuatro intentos, con cinco minutos entre intentos. La idempotencia se envía al proveedor y los avisos de estados anteriores se omiten. La aceptación del proveedor no demuestra entrega al destinatario.

No hay cobro integrado ni confirmación bancaria de pago. La confirmación indica que la profesional comunicará las instrucciones de pago. La elección e integración del proveedor para Brasil queda pendiente.

## Comprobación

`npm run db:test`, `npm run lint`, `npm run build -- --webpack`, `npm run api:test` y `npm run agenda:test`. Las pruebas API usan datos sintéticos y revisan aislamiento, revocación, anticipación, plazo, retención concurrente, confirmación idempotente, rechazo, alternativa, vencimiento y cola de avisos.
