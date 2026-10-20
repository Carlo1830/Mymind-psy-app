# Agenda avanzada: primera entrega

## Implementado
- Campos por profesional: google_calendar_token (reservado para ciphertext), sync_enabled, preferencias de correo/WhatsApp y anticipación de 1 a 168 horas.
- estado_confirmacion separado del estado clínico: pendiente, confirmada, recordatorio_enviado, cancelada. El aviso al agendar no equivale a confirmación del paciente.
- Cola transaccional para citas nuevas y reprogramaciones, incluidas reservas públicas. Omite citas canceladas, realizadas, antiguas o cuyos datos de envío han cambiado.
- Helper Resend, procesamiento tras el guardado y endpoint protegido para el programador. No incluye notas clínicas, motivo de consulta ni nombre del paciente.
- Ajustes privados por profesional; sin exponer tokens. Canales desactivados por defecto.

## Activación
1. Ejecutar npm run db:migrate antes de desplegar el código.
2. Configurar RESEND_API_KEY y EMAIL_FROM (remitente verificado).
3. Definir CRON_SECRET y programar cada cinco minutos GET /api/agenda/recordatorios con Authorization: Bearer <CRON_SECRET>.
4. Activar Correo en Calendario > Ajustes de agenda para cada profesional.
No se activaron envíos ni cron en producción. Los cambios de anticipación aplican a nuevas citas/reprogramaciones, no retroactivamente. Los fallos del proveedor quedan como fallido para revisión; no hay reenvío manual en esta fase. El worker descarta trabajos con más de 23 horas desde su vencimiento para limitar la ventana de idempotencia. Los recordatorios de reservas próximas esperan al menos cinco minutos tras crearlas.

## Siguiente fase
- Google Calendar: credenciales OAuth, state de un solo uso, PKCE, callback autenticado, cifrado de tokens, revocación y sincronización. El botón todavía está deshabilitado, no es una conexión efectiva.
- WhatsApp: proveedor, plantillas autorizadas y consentimiento. El toggle solo almacena una preferencia.
- Confirmación por paciente: enlaces firmados y caducables, historial de transiciones.
- Operación: pantalla de fallos, reintentos controlados, pruebas de entrega reales y scheduler según el plan de hosting.

## Referencias
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://developers.google.com/identity/protocols/oauth2/web-server
