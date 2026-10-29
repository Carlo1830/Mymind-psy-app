# Atención clínica

En `/pacientes`, abrir la ficha. El expediente previo conserva motivo de consulta, antecedentes, hipótesis y notas confidenciales. Atención clínica añade identificación opcional, contacto de apoyo y representante cuando corresponda; objetivos terapéuticos con criterio de logro, estado y fecha de revisión; y una nota estructurada por sesión.

## Uso profesional

1. Completar la ficha y acordar objetivos con el paciente. No introducir datos innecesarios.
2. Seleccionar una cita o registrar una sesión pasada. Iniciar un borrador.
3. Registrar resumen, intervenciones, evolución y próximos pasos. **Guardar borrador** persiste el texto en el servidor; no hay autoguardado ni almacenamiento clínico local.
4. Revisar la versión guardada. Finalizar requiere resumen y una sesión no cancelada que ya haya comenzado. La confirmación marca la sesión realizada y bloquea contenido y datos de la cita.
5. Corregir posteriormente mediante una adenda. No se reemplaza el original.

Cada guardado de nota genera una versión con autor y fecha del servidor. Las revisiones, adendas y eventos no admiten modificación ni borrado desde la aplicación. La base también impide reescribir notas finalizadas y cambiar sus sesiones. La ficha y los objetivos tienen control de versión para rechazar ediciones obsoletas. La trazabilidad muestra los últimos 100 eventos del módulo; cada nota conserva todas sus versiones. No es un registro de accesos de lectura ni una firma electrónica certificada.

La interfaz avisa ante cambios sin guardar al cerrar o cambiar ficha y al navegar por enlaces. Un cierre forzado del navegador o retrocesos internos del navegador pueden perder texto sin guardar: guardar el borrador antes de salir.

Los textos de evolución anteriores permanecen íntegros y se consultan en “Historial previo de evolución conservado”. No se convierten automáticamente en notas finalizadas ni se inventa contenido clínico. El endpoint previo de evolución sigue disponible por compatibilidad; el nuevo flujo usa exclusivamente `/api/pacientes/:id/atencion`.

## Despliegue

Aplicar `supabase/migrations/202610280001_clinical_care.sql` con `npm run db:migrate` antes de desplegar la aplicación. No editar migraciones ya aplicadas. Como alternativa administrativa sin CLI, generar `node scripts/generate-migration-sql.mjs` y ejecutar `docs/sql/apply-clinical-care.sql` en SQL Editor como postgres. El archivo generado verifica las migraciones previas y registra la nueva en ambos historiales dentro de una transacción. Aborta ante diferencias; no repara ni oculta historiales inconsistentes. Puede repetirse. Regenerarlo antes de usarlo si se incorporan otras migraciones.

Las seis tablas nuevas pertenecen al esquema privado `mymind`, con RLS y sin acceso para roles públicos. El servidor valida sesión, origen y propietario en todas las operaciones. Las mutaciones usan transacción y bloqueo por profesional, compartido con la agenda. Los identificadores estables evitan duplicar notas y adendas ante reintentos.

## Verificación

`npm run typecheck`, `npm run lint`, `npm run db:test`, `npm run build`, `npm run api:test`.

Las pruebas usan bases temporales y pacientes sintéticos: conservación del texto anterior, fechas inválidas, control de versiones, dos guardados concurrentes, finalización, adendas repetidas, rechazo de cambios SQL sobre historial, protección de citas, separación de profesionales y CSRF. La entrega SQL se prueba repetida y con finales de línea del editor Windows. No equivalen a una prueba de carga ni verifican por sí solas el despliegue real.

Este hito no incorpora consentimientos firmados, facturación, portal del paciente ni auditoría de lecturas. Esos módulos requieren trabajo separado.
