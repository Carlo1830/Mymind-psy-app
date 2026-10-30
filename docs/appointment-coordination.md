# Coordinación de citas

Estado: implementado y probado localmente; pendiente de publicar y verificar correo real.

## Comportamiento

- Series de 1 a 52 citas, cada 1, 2 o 4 semanas. Se conserva la hora en la zona IANA del dispositivo. Se rechazan horas ambiguas o inexistentes por DST.
- Creación transaccional: cualquier conflicto revierte toda la serie. El bloqueo por profesional también protege frente a reservas simultáneas.
- Edición individual de fecha, duración y modalidad. Edición de duración/modalidad o cancelación de esta y futuras citas programadas de la serie, conservando las fechas. Las citas pasadas y las notas finalizadas se conservan.
- Ausente es distinto de Cancelada. Realizada/Ausente no se permiten en fechas futuras.
- Confirmación individual registrada por el profesional o por enlace firmado de correo. Abrir el enlace no confirma: el paciente debe pulsar un botón. Un cambio de fecha, modalidad o duración invalida los enlaces y la confirmación anteriores, incluso si después se vuelve a los datos originales.
- El envío de un recordatorio no confirma asistencia. La aceptación de Resend no se presenta como entrega.
- Reintentos automáticos con esperas de 5, 25 y 125 minutos, máximo cuatro intentos. Límite de 23 horas desde el primer fallo para conservar la ventana de idempotencia del proveedor. El calendario no reenvía correos de citas canceladas, pasadas o con datos obsoletos.
- Panel privado de los últimos 50 correos: pendiente, aceptado, entregado, rebotado, queja, omitido o fallido. Eventos de Resend autenticados con firma Svix y ventana de cinco minutos. Si el comprobante llega antes de registrar la aceptación, se responde 503 para solicitar reintento al proveedor. Los eventos duplicados son idempotentes y uno antiguo no sustituye un resultado posterior.

## Publicación y comprobación pendiente

1. Aplicar `docs/sql/apply-appointment-coordination.sql` como postgres en Supabase antes de desplegar. Es atómico y repetible y comprueba ambos historiales. Alternativamente, `npm run db:migrate` con DIRECT_URL.
2. Publicar la rama `feat/coordinacion-citas` en el repositorio Carlo1830/Mymind-psy-app y desplegarla en el proyecto Vercel existente.
3. Configurar en Vercel, sin exponer valores al cliente: RESEND_API_KEY, EMAIL_FROM con dominio verificado, APP_ORIGIN, CRON_SECRET, AGENDA_CONFIRMATION_SECRET (secreto aleatorio independiente de al menos 32 bytes), RESEND_WEBHOOK_SECRET.
4. Registrar en Resend `/api/agenda/webhook` para email.delivered, email.bounced y email.complained. Copiar su secreto de firma en RESEND_WEBHOOK_SECRET.
5. Configurar un programador cada cinco minutos para GET `/api/agenda/recordatorios` con Authorization: Bearer CRON_SECRET. El repositorio no presupone un plan Vercel compatible con cron frecuente. El disparo después de guardar una cita no sustituye este programador.
6. Activar correo en los ajustes de agenda del profesional.
7. Con un destinatario de prueba autorizado, comprobar aviso, recordatorio a la hora prevista, evento entregado y confirmación del paciente. Reprogramar para comprobar invalidación de enlaces y supresión del aviso anterior. Comprobar fallo/reintento en entorno de prueba. No usar pacientes reales para estas pruebas.

La entrega real, el remitente verificado y la ejecución periódica no se han comprobado en producción. WhatsApp y Google Calendar siguen fuera de esta entrega. La política de cancelación no se inventa ni impone cargos.

## Validación

- `npm run build`: compilación y TypeScript.
- `npm run lint`.
- `npm run agenda:test`: DST, tokens, firmas, cola con PostgreSQL, aceptación, reintentos y supresión por cancelación.
- `npm run db:test`: migraciones, aislamiento y reconciliación, incluyendo restricciones reemplazadas.
- `npm run api:test`: regresión completa y recurrencia atómica, conflicto, ausencia, confirmaciones, cancelación de serie, webhook y aislamiento de entregas.

Los correos en pruebas se simulan; no prueban recepción de un buzón real.
