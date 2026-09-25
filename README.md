# Mymind-psy-app

Aplicación web de gestión psicológica con Next.js App Router, React, TypeScript, Tailwind CSS y PostgreSQL alojado en Supabase. Incluye CRM, calendario, autenticación multi-profesional y herramientas de marketing.

## Configuración de Supabase y Vercel

Requiere Node.js 24 y npm. Copiar las variables de `.env.example` a `.env.local`. Las claves privadas no se incluyen en Git. La URL y la clave publicable sí pueden utilizarse en el navegador; las conexiones PostgreSQL se usan exclusivamente en el servidor.

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: clientes en `src/lib/supabase/client.ts` y `server.ts`.
- `DATABASE_URL`: Transaction pooler, puerto 6543, usuario `postgres.PROJECT_REF`.
- `DIRECT_URL`: Session pooler, puerto 5432, para migraciones, importación y administración.
- `APP_ORIGIN`: origen exacto del dominio desplegado, sin barra final.
- `ALLOW_REGISTRATION=false`: permite cerrar el alta pública si la consulta no ofrece registro libre.

La contraseña de la URL debe codificarse y los corchetes de una plantilla deben sustituirse. El controlador verifica TLS y utiliza el certificado público de Supabase incluido en `database/certs/supabase-ca.crt`. `next.config.ts` lo incluye en las funciones de Vercel. `DATABASE_SSL_CA_PATH` permite indicar otro certificado de confianza.

### Migración inicial

Con la base PostgreSQL vacía y la aplicación SQLite detenida, ejecutar en este orden:

```sh
npm install
npm run db:migrate
npm run db:import -- data/mymind.sqlite
npm run auth:setup -- carlo12141518@gmail.com
npm run db:check
npm run build
npm run dev
```

Si no hay una base anterior, omitir `db:import`. El importador abre SQLite en modo de solo lectura, conserva IDs, propietarios, fechas y notas y aplica una transacción a todo el traslado. Solo admite claves existentes si los datos son idénticos; cualquier diferencia aborta la importación. No sobrescribe una base que ya esté en uso. No se copian sesiones de acceso, límites de intentos ni tokens de activación: los usuarios deben volver a entrar.

Las migraciones de `supabase/migrations` se registran con checksum y no se ejecutan durante las peticiones ni durante el build. `db:init` es un alias de `db:migrate`. La fuente SQLite se conserva como respaldo local y no se utiliza en producción.

### Administrador principal

`auth:setup` configura a `carlo12141518@gmail.com` como administrador de la plataforma, conserva su contraseña si ya estaba activado y establece el profesional del sitio público. Si está pendiente, escribe un enlace de un uso y 24 horas en `data/activar-cuenta-postgres.txt`. El usuario define su contraseña en ese formulario. El comando puede repetirse para renovar una activación caducada. No concede acceso a pacientes de otros profesionales.

La autenticación de la aplicación sigue usando scrypt y cookies propias, ahora persistidas en PostgreSQL. No se ha sustituido por Supabase Auth ni se crean usuarios en `auth.users`: los roles de la plataforma están en `mymind.usuarios`.

### Despliegue

En Vercel seleccionar Next.js, Node.js 24 y añadir las variables anteriores en el entorno correspondiente. Ejecutar las migraciones y la semilla desde un entorno administrativo antes del primer despliegue. `DIRECT_URL` solo es necesaria donde se ejecutan esos scripts; Vercel usa `DATABASE_URL`. Las variables `NEXT_PUBLIC_*` deben existir al compilar. La base y el archivo de activación no se suben a Vercel.

El servidor usa un pool pequeño, consultas parametrizadas sin prepared statements con nombre y bloqueos transaccionales por profesional para coordinar reservas entre instancias. La disponibilidad se genera por lotes para evitar cientos de llamadas a la base remota.

Abrir `/` para el sitio público, `/acceso` para entrar y `/dashboard` para las métricas privadas. La compilación por sí sola no verifica las credenciales ni completa el despliegue: `db:check` debe pasar contra el proyecto real.

## Módulos

### Sitio público y dashboard

`/` presenta el espacio profesional, especialidades configuradas en el perfil, una autoevaluación reflexiva de cuatro preguntas y reservas directas. La autoevaluación no calcula puntuaciones clínicas ni almacena respuestas.

`/dashboard` requiere autenticación y muestra datos del profesional conectado: pacientes en tratamiento activo, citas de lunes a domingo sin canceladas y nuevos pacientes del mes cuya fuente es captación o reservas. Los periodos se calculan en America/Santiago. Incluye los próximos encuentros.

### Disponibilidad y reservas

El editor de `/calendario` permite cambiar días, inicio, fin, duración y modalidad, pausar la publicación, añadir horarios puntuales y retirar horarios individuales. La cuenta principal inicia con lunes a viernes de 09:00 a 18:00, sesiones de 50 minutos y elección entre Presencial y Online. Los horarios se generan para los próximos 90 días en America/Santiago, con sesiones consecutivas completas dentro del intervalo. Las dos modalidades comparten el mismo cupo.

La reserva pública registra una cita Programada y un paciente Nuevo contacto con fuente «Reserva desde la web». Si el correo ya existe en el CRM del profesional, reutiliza el paciente sin cambiar su estado. Las reservas repetidas con el mismo identificador no se duplican y los conflictos de agenda se rechazan dentro de una transacción. También se comprueban solapamientos al crear o modificar citas privadas.

Los cambios de regla conservan citas reservadas. Cancelar o reprogramar una cita pública retira su horario anterior: puede publicarse de nuevo desde el editor. Retirar un horario generado se respeta hasta la siguiente edición de la regla. La confirmación aparece en pantalla; no se envían correos automáticos.

El sitio principal muestra únicamente al profesional seleccionado mediante `auth:setup`. Los demás profesionales mantienen sus datos y configuraciones separados.

### Pacientes

`/pacientes`: creación y edición, tabla y tarjetas, búsqueda por nombre sin distinguir acentos, filtro por estado, ficha con notas confidenciales y fuente de captación, e historial de sesiones. Las notas de evolución nuevas se añaden con fecha UTC conservando el texto anterior.

### Calendario

`/calendario`: vistas mensual y semanal, navegación por periodos, citas con estado, duración y modalidad. El formulario permite agendar y reprogramar sin modificar las notas ni trasladar una sesión a otro paciente. Los enlaces a la ficha pueden seleccionar una sesión para añadir evolución.

Las fechas se capturan y muestran en la zona horaria del dispositivo y se guardan en UTC. La duración admite entre 5 y 480 minutos. Las citas se muestran en el día de inicio. La migración de sesiones anteriores asigna 50 minutos y Presencial como valores iniciales editables, no como información histórica verificada.

### Marketing

`/marketing` reúne cuatro espacios:

- Perfil profesional: nombre, especialidad, tono y enlace HTTPS para agendar.
- Contenido social: cuatro temas, tres formatos y tres tonos. Borradores editables con gancho, desarrollo, reflexión, CTA y hashtags, y copia con un clic. El motor actual combina plantillas editoriales locales; no utiliza un proveedor de IA ni datos de pacientes. Las modificaciones de un borrador son temporales hasta que se copian.
- Plantillas y secuencias: bienvenida, recordatorio, seguimiento en dos pasos y reactivación. Texto, asunto y días de espera son editables por cada profesional. Variables: `{{nombre_paciente}}`, `{{fecha_hora}}`, `{{nombre_profesional}}`, `{{enlace_consulta}}`. Se muestra vista previa y el consentimiento de captación disponible. WhatsApp Web y el cliente de email se abren con el mensaje preparado; el envío lo realiza el usuario. Los días son una referencia de secuencia, no un programador automático.
- Captación: guías descargables en texto UTF-8 (.txt) y tests de reflexión con preguntas editables. Publicación y despublicación, enlace compartible, consentimiento y registro del prospecto con fuente en el CRM. Los tests no asignan diagnósticos ni puntuaciones clínicas. Sus respuestas no se almacenan. La entrega del recurso ocurre en el formulario; no se envían emails automáticos.

Una captura repetida del mismo recurso y paciente no duplica el prospecto. Si el email ya existe en el CRM del profesional, se conserva su estado y nombre y se asocia la solicitud mediante `captaciones`. No se buscan coincidencias entre profesionales.

## Autenticación y separación de datos

- Contraseñas derivadas con scrypt y sal aleatoria; no se guardan en texto plano.
- Sesiones opacas de ocho horas con token aleatorio de 32 bytes; solo se almacena su hash SHA-256.
- Cookies HttpOnly, SameSite=Lax y Secure fuera de localhost; con `APP_ORIGIN=https://...`, Secure también se aplica en local.
- La autorización se valida en cada API privada y en cada página privada. Los pacientes tienen `usuario_id`; las sesiones heredan su propietario a través del paciente. Perfiles, plantillas y recursos se consultan por propietario.
- El rol `administrador` de la cuenta principal no concede acceso a los datos clínicos de otros profesionales. Su aprovisionamiento se realiza desde el script administrativo.
- Las APIs privadas devuelven 401 sin sesión y 404 ante identificadores de otro profesional. Las mutaciones comprueban el origen. JSON limitado a 100 KB, consultas parametrizadas y respuestas `no-store`.
- Límites de intentos persistentes para autenticación y captación pública. No se confía en cabeceras de IP reenviada enviadas por el cliente.
- El esquema privado `mymind` tiene RLS activado sin políticas públicas y permisos revocados para `anon` y `authenticated`. Las API del servidor aplican el propietario en cada consulta. No hay acceso clínico desde la clave publicable. El importador exige que los pacientes anteriores tengan propietario.

Excepciones públicas necesarias: acceso, registro, activación, consulta de sesión, cierre de sesión, `/api/publico/:id`, `/api/reservas/disponibilidad` y `/api/reservas`. Las reservas públicas exponen únicamente horarios disponibles y la confirmación de la solicitud. El endpoint de recursos solo expone recursos publicados, identidad profesional de presentación y consentimiento; no expone pacientes, sesiones, notas ni configuración privada. Las capturas se asignan al propietario del recurso desde el servidor, ignorando cualquier propietario enviado por el cliente.

## API

| Ruta | Operaciones | Acceso |
| --- | --- | --- |
| `/api/auth/register`, `/api/auth/login`, `/api/auth/activate` | POST | Público, validado y limitado |
| `/api/auth/me`, `/api/auth/logout` | GET / POST | Sesión propia, sin datos clínicos |
| `/api/dashboard` | GET | Usuario autenticado |
| `/api/disponibilidad` | GET, POST, PUT, DELETE | Propietario |
| `/api/reservas/disponibilidad` | GET | Público, horarios disponibles |
| `/api/reservas` | POST | Público, validado y limitado |
| `/api/perfil` | GET, PUT | Usuario autenticado |
| `/api/pacientes` | GET, POST | Propietario |
| `/api/pacientes/:id` | GET, PUT | Propietario |
| `/api/pacientes/:id/sesiones` | POST | Propietario |
| `/api/sesiones` | GET, POST | Propietario |
| `/api/sesiones/:id` | PUT | Propietario |
| `/api/marketing/contenido` | POST | Usuario autenticado |
| `/api/marketing/plantillas` | GET, PUT | Propietario |
| `/api/marketing/recursos` | GET, POST, PUT | Propietario |
| `/api/publico/:id` | GET, POST | Recurso publicado |

El calendario consulta `desde` y `hasta` en ISO UTC, con extremo final excluido y un intervalo máximo de 100 días.

## Verificación

```sh
npm run lint
npm run typecheck
npm run build
npm run db:test
npm run api:test
```

La prueba API necesita una compilación previa, arranca en el puerto 3187 y usa PostgreSQL embebido (PGlite) temporal por TCP, sin conectarse al proyecto Supabase. Verifica páginas autenticadas, accesos sin sesión, dos profesionales aislados, roles, CSRF, sesiones expiradas y revocadas, activación de un uso, CRM, calendario, plantillas, contenido y captación pública. Las pruebas de esquema verifican importación desde SQLite, conservación de notas, semilla del administrador, repetición de migraciones, conflictos de importación y acceso denegado al rol anónimo. PGlite multiplexa conexiones sobre una sesión; no sustituye una prueba de carga en Supabase.

También se comprobó desde el navegador el acceso, perfil, generación y copia, edición de plantillas, publicación de un recurso y registro del prospecto en el CRM. No se enviaron mensajes a WhatsApp ni email durante las pruebas.

## Referencias técnicas

- [Autenticación y autorización en Next.js](https://nextjs.org/docs/app/guides/authentication).
- [API de criptografía de Node.js](https://nodejs.org/api/crypto.html).

Los borradores de contenido son textos originales de carácter general, no instrumentos clínicos validados ni reproducciones de guías externas.

Las pruebas de API también verifican landing pública, dashboard privado, disponibilidad semanal, consentimiento, reservas concurrentes, reintentos, solapamientos, métricas y aislamiento entre profesionales. Se comprobó en navegador una reserva con datos sintéticos y su aparición en el dashboard.

Fuentes de configuración: [clientes SSR de Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [conexiones PostgreSQL y poolers](https://supabase.com/docs/guides/database/connecting-to-postgres), [ubicación oficial del certificado](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).
