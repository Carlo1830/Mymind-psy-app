# Desarrollo para el uso diario de la consulta

## Entrega local: notas de sesión pendientes

Se añadió a «Mi consulta» una lista de borradores guardados, con su total y hasta cinco sesiones ordenadas de la más antigua a la más reciente. «Retomar nota» abre la ficha y la nota correspondiente; el panel recibe el foco cuando termina de cargar.

La lista no incluye textos de la nota, contactos ni objetivos. `GET /api/atencion/pendientes` exige sesión y filtra por profesional. Las notas de pacientes archivados siguen visibles con una indicación de archivo. Las citas canceladas se identifican; su nota sigue sujeta a las restricciones de finalización existentes. Las notas finalizadas no aparecen como pendientes.

No requiere migraciones. No se cambió el contenido de las notas existentes ni se desplegó esta entrega a producción.

## Validación

- `npm run lint` y `npm run typecheck`.
- `npm run build -- --webpack`, utilizado por el fallo local de Turbopack ya documentado.
- `npm run api:test`: acceso sin sesión rechazado, separación entre dos profesionales, campos de respuesta sin contenido clínico, lista vacía, borradores, exclusión de finalizadas, orden, límite de cinco, total de siete y pacientes archivados. Incluye las pruebas existentes de conservación, versiones, finalización y adendas.
- Navegador sobre una base temporal: crear y guardar un borrador, encontrarlo en el inicio, abrirlo desde «Retomar nota», finalizarlo, añadir una adenda, recargar y comprobar conservación. Al regresar al inicio, la lista vuelve al estado vacío.

Las pruebas usan datos sintéticos mediante `npm run evaluaciones:preview`. No acreditan una validación del despliegue de esta entrega ni de su rendimiento en producción.

## Prioridades propuestas después de esta entrega

[Inferencia] Este orden es una propuesta de desarrollo para completar la operación; no es una lista de funcionalidades ya entregadas ni una certificación de aptitud clínica o normativa.

1. **Acceso recuperable:** implementar recuperación de contraseña con enlace de un uso y caducidad, limitar solicitudes y revisar la revocación de sesiones. El formulario local actual ofrece acceso, registro y activación; no ofrece recuperación de contraseña.
2. **Comunicaciones operativas:** configurar remitente y proveedor de correo, verificar el programador y los comprobantes de entrega con mensajes de prueba, y comprobar la confirmación del paciente. La configuración externa y la recepción real se deben comprobar antes de declararlas operativas.
3. **Recuperación ante incidentes:** verificar la configuración real de copias de seguridad, realizar una restauración de prueba y definir registro de errores sin textos clínicos. El estado de las copias y la supervisión de producción no se comprobó en esta entrega.
4. **Uso en móvil y accesibilidad:** revisar reserva, calendario, ficha y formularios con pantalla pequeña, teclado y errores de conexión; resolver los problemas encontrados.
5. **Ampliaciones de producto:** evaluar consentimientos, documentos e informes, pagos y portal del paciente con requisitos específicos antes de implementarlos. La prioridad y alcance de estas ampliaciones siguen por definir.

Google Calendar y WhatsApp permanecen como integraciones posteriores, según los documentos de agenda. Su incorporación depende de credenciales, configuración y decisiones de producto pendientes.
