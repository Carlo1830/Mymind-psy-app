# Portal de pacientes adultos

Implementación del 26-11-2026. Incorporación individual y gradual. La atención de menores y representantes no forma parte de esta versión.

## Acceso y alcance

- Entrada del paciente: `/paciente/acceso`, visible desde el sitio público como **Sou paciente** y desde el acceso profesional. Cuenta personal con correo y contraseña. El área `/paciente` no usa la barra profesional.
- En la ficha profesional, **Portal del paciente** permite crear una invitación. Requiere un correo válido, fecha de nacimiento adulta y confirmación de la profesional de que comprobó edad y titularidad del correo. Si la ficha clínica ya contiene una fecha de nacimiento, debe coincidir.
- La invitación dura 48 horas, es de un uso y solo activa la ficha seleccionada. El paciente escribe el correo al que fue invitado y establece su propia contraseña de 12 a 128 caracteres. Renovar una invitación invalida la anterior.
- La sesión dura ocho horas, con cookie separada HttpOnly, SameSite=Lax y Secure en producción. Los tokens de sesión e invitación se guardan como SHA-256 y las contraseñas como scrypt con sal aleatoria. No se registran contraseñas ni enlaces completos en la actividad.
- Se reutiliza el sistema de autenticación propio que ya empleaba la aplicación, con tablas y sesiones separadas para pacientes, sobre PostgreSQL de Supabase. **No es una implementación de Supabase Auth**. Esta elección evita una migración simultánea del acceso profesional y no requiere una clave administrativa nueva. Los clientes Supabase existentes no autentican este portal.
- La posesión del enlace y el conocimiento del correo invitado autorizan la activación. El envío manual requiere comprobar la identidad del destinatario; no se presenta como verificación automática de titularidad del correo.
- Una cuenta de paciente no concede acceso a las API profesionales. El servidor obtiene la ficha de la sesión y no acepta seleccionar otro paciente desde el navegador. El mismo correo no puede habilitar dos fichas; la profesional debe revisar duplicados.

## Pantallas del paciente

1. **Início:** próxima consulta, solicitudes pendientes y documentos disponibles.
2. **Minhas consultas:** disponibilidad, solicitud desde la cuenta, estados y consultas registradas. Se mantienen las 24 horas mínimas y seis horas corridas de respuesta. Cambios y cancelaciones de citas confirmadas siguen coordinándose con la profesional. La alternativa se solicita si aún está libre.
3. **Minha ficha:** nombre, correo y fecha de nacimiento de su cuenta, datos de contacto y antecedentes aportados por el paciente. Tiene control de versión para detectar ediciones simultáneas. Los datos aportados se conservan separados de la valoración clínica y aparecen en la ficha profesional.
4. **Documentos:** textos que la profesional preparó y publicó para el titular. La versión inicial no incluye carga de adjuntos, firma electrónica ni generación de PDF.
5. **Minha conta:** cambio de contraseña con comprobación de la contraseña actual. Cambiarla o restablecerla invalida las sesiones anteriores.

El portal usa portugués de Brasil; la gestión profesional conserva el idioma actual de la aplicación. La modalidad y los textos de coordinación enviados por la profesional mantienen su contenido original.

## Ficha clínica y pedidos

Las notas anteriores, los borradores, las hipótesis y los instrumentos de evaluación no se publican por habilitar una cuenta. La profesional debe revisar el alcance de los registros y preparar la documentación que corresponda a su titular.

El paciente puede pedir acceso a su prontuario o corrección de datos. Los pedidos aparecen en Inicio de la profesional y en la ficha del paciente. La profesional responde por el portal y puede publicar el documento preparado. No se interpreta la ausencia de un documento en pantalla como inexistencia del registro o denegación del derecho de acceso. Esta función no clasifica por sí sola los registros clínicos existentes ni certifica cumplimiento normativo.

Los documentos publicados conservan su texto. Retirarlos del portal oculta su contenido al paciente, pero lo conserva en la ficha profesional. Para corregir un documento se publica otro y se retira el anterior. No se afirma que un consentimiento mostrado esté firmado o aceptado.

Referencias del diseño: [CFP 001/2009, art. 5](https://site.cfp.org.br/wp-content/uploads/2009/04/resolucao2009_01.pdf), [derechos del titular, ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares). La clasificación y entrega clínica concreta corresponde revisarla con la profesional.

## Recuperación, revocación y archivo

- **Esqueci minha senha** intenta enviar un enlace individual de 30 minutos. No revela si existe una cuenta y no devuelve el token a quien solicita el correo.
- Si el correo no está configurado, el paciente ve que debe contactar a su profesional. La profesional puede generar un enlace individual de recuperación y compartirlo tras comprobar la identidad. Crear ese enlace no revela ni cambia la contraseña por sí solo.
- Revocar acceso elimina las sesiones e invitaciones de esa cuenta y el enlace anterior de agenda. Los datos clínicos y los documentos se conservan. Se puede crear una invitación nueva para volver a habilitar a su titular.
- Archivar al paciente o cambiar su correo revoca la cuenta, sesiones y enlaces mediante un trigger. Restaurar su ficha no restaura automáticamente el acceso. Si cambia el correo, verificar su identidad y crear una invitación nueva; la ficha y los documentos se conservan.
- La autenticación comprueba también fechas de nacimiento clínicas que indiquen minoría de edad. No permite usar una cuenta adulta para representar a un menor.
- La actividad del portal registra activación, sesiones iniciadas, cambios de contraseña, ficha, documentos y pedidos. El historial es de solo inserción. No sustituye un registro completo de todas las lecturas.

## Correo y despliegue

No necesita claves nuevas. Reutiliza `DATABASE_URL`, `APP_ORIGIN`, `RESEND_API_KEY` y `EMAIL_FROM`. Las dos últimas y el remitente verificado siguen pendientes si no se han configurado. La interfaz distingue un enlace creado de un correo aceptado por el proveedor; no afirma entrega real.

1. Aplicar `202611260001_patient_accounts.sql` con `npm run db:migrate`, o generar la entrega del SQL Editor con `node scripts/generate-migration-sql.mjs docs/sql/apply-patient-accounts.sql`.
2. El generador comprueba los dos historiales de migración y permite repetir la aplicación sin duplicar tablas. Aplicar antes del despliegue del código nuevo.
3. Ejecutar `npm run lint`, `npm run build -- --webpack`, `npm run db:test`, `npm run portal:test`, `npm run api:test` y `npm run agenda:test`.
4. Comprobar en producción la página pública de acceso y la gestión del portal. No crear cuentas de pacientes reales como prueba de despliegue.

La migración añade tablas privadas con RLS sin políticas públicas. Las consultas del servidor usan la conexión existente y controles de titularidad explícitos. No concede acceso directo de pacientes al esquema clínico de Supabase.

Los enlaces antiguos siguen limitados a la agenda; no permiten consultar la ficha del nuevo portal. Al activar la cuenta se revoca el enlace de agenda anterior. Los pagos integrados, WhatsApp automático, las cuentas de menores y los representantes siguen fuera de esta versión.
