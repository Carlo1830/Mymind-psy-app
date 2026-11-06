# Funciones adicionales observadas en producción

Revisión de interfaz: 05-11-2026, mediante una sesión autenticada en https://mymind-psy-app-prod.vercel.app.

Este documento registra controles y textos visibles durante una revisión de solo lectura. No acredita el funcionamiento de las escrituras, la estructura de la base de datos ni la implementación del servidor. No se crearon ni modificaron registros durante la revisión.

## Atención clínica en la ficha del paciente

Además del expediente estructurado y las evaluaciones clínicas ya documentados, se observó una sección «Atención clínica» con los siguientes elementos:

| Función | Evidencia visible | Validación pendiente |
| --- | --- | --- |
| Identificación y contactos de apoyo | Apartado desplegable con ese nombre. | Abrir el apartado, documentar sus campos y comprobar consulta y guardado. |
| Objetivos terapéuticos | Sección con botón «Añadir objetivo», explicación de objetivos acordados con el paciente y estado vacío. | Creación, edición, seguimiento y persistencia; los controles adicionales no se inspeccionaron. |
| Registro de sesión | Selector de sesión, opción «Registrar una sesión ya realizada», fecha y hora, modalidad y botón «Iniciar borrador». | Crear y recuperar un borrador con datos de prueba controlados. |
| Finalización de sesión | La interfaz indica que finalizar bloquea el contenido y marca la sesión como realizada. | Comprobar ambas operaciones y el comportamiento ante errores. No se finalizó ninguna sesión. |
| Adendas | La interfaz indica que las correcciones posteriores se agregan como adendas. | Verificar creación, asociación y conservación del registro original. No se creó ninguna adenda. |
| Trazabilidad de la atención | Apartado desplegable con ese nombre. | Inspeccionar los eventos mostrados y comprobar su correspondencia con acciones realizadas. |
| Historial previo de evolución conservado | Apartado desplegable con ese nombre. | Comparar el contenido con los registros anteriores para verificar su conservación. |

La interfaz también indica que los borradores guardados permanecen privados en el expediente. Esa indicación no se verificó mediante pruebas de acceso entre profesionales.

## Seguimiento de correos en calendario

Se observó la sección «Confirmaciones y recordatorios por correo», dentro de «Seguimiento de correos», con el botón «Consultar entregas».

El texto visible distingue «Aceptado» como recepción por el proveedor y «Entregado» como un estado que requiere comprobante; aclara que no significa lectura ni confirmación del paciente. También anuncia hasta cuatro intentos ante fallos.

Estos estados y reintentos son comportamiento anunciado por la interfaz, no resultados comprobados en esta revisión. No se consultaron entregas ni se enviaron correos. Quedan pendientes las pruebas de entrega, comprobantes, fallos y límites de reintento.

En los ajustes observados, el correo automático estaba deshabilitado por falta de configuración de Resend y remitente verificado. Google Calendar estaba deshabilitado y WhatsApp indicaba que el envío no estaba implementado.

## Relación con la documentación anterior

Actualización tras sincronizar el repositorio: la copia local se actualizó de `a0a2b46` a `cebf229` mediante avance directo desde `origin/main`, conservando los cambios documentales locales. Se recuperaron los documentos técnicos [Atención clínica](atencion-clinica.md), [Coordinación de citas](appointment-coordination.md) e [Historial de migraciones](migration-history.md). Las observaciones siguientes describen la documentación disponible antes de esa sincronización.

- `expediente-clinico.md` describe el expediente estructurado anterior. Este documento añade el inventario observado de atención clínica sin atribuirle rutas, tablas o migraciones no comprobadas.
- `agenda-avanzada.md` describe una primera entrega que deja la pantalla de fallos y los reintentos como fase posterior. La interfaz observada ya anuncia seguimiento de entregas y reintentos. Falta verificar su implementación antes de actualizar las instrucciones técnicas de esa primera entrega.
- Las afirmaciones históricas sobre despliegue de los documentos anteriores no constituyen una comprobación del estado actual de producción.

## Continuidad del desarrollo

1. Identificar la revisión de código desplegada y compararla con el repositorio local antes de modificar estas funciones.
2. Reconciliar los historiales de migraciones de la aplicación y Supabase, pendiente del historial compartido por el usuario.
3. Validar el registro de una evaluación desde el formulario hasta el historial y gráfico, pendiente del mismo historial.
4. Validar el circuito de atención clínica con un caso de prueba controlado: objetivo, borrador, finalización, adenda y trazabilidad.
5. Configurar y verificar el circuito de correo, incluidos comprobantes y reintentos, antes de considerarlo operativo.

Los puntos 4 y 5 son una propuesta de continuidad derivada de la revisión, no un compromiso previo confirmado del usuario. No se han ejecutado como parte de esta actualización documental.

## Comprobación posterior de migraciones

Tras sincronizar el repositorio se consultaron ambos historiales de Supabase. Los nueve archivos locales están registrados en ambos historiales. `npm run db:check` terminó correctamente con `migrationHistoryConsistent: true` y `allTablesRlsEnabled: true`; también comprobó que la consulta de columnas de evaluaciones es válida. No se aplicaron cambios a producción.

Dos archivos antiguos de la copia local tenían CRLF y se normalizaron a LF, conforme a `.gitattributes`. Sus firmas LF coinciden con las registradas en producción; no se cambiaron sentencias SQL ni firmas de la base.

Las cuatro pruebas de `npm run db:test` pasaron en una base temporal: esquema/importación/acceso privado, parámetros, reconciliación de historiales y entrega SQL de atención clínica. Esto no sustituye la prueba del formulario de evaluaciones.

Después se completó la prueba del formulario con un paciente sintético en una base temporal local: dos registros PHQ-9 por puntaje directo y uno GAD-7 por ítems, detalle de respuestas, separación de series y recuperación después de recargar. También pasaron las pruebas de API. El procedimiento y las limitaciones están registrados en [Evaluaciones clínicas](evaluaciones-clinicas.md#verificación-del-05-11-2026). No se registraron evaluaciones de prueba en producción.
