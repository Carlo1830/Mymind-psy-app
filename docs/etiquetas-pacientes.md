# Etiquetas personalizadas de pacientes

## Datos y migración
Migración: supabase/migrations/202610190002_patient_tags.sql.
Campo mymind.pacientes.etiquetas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]. Registros existentes quedan sin etiquetas. No modifica estados, notas ni sesiones.
API: máximo 20 etiquetas por paciente y 50 caracteres por etiqueta; recorta espacios, normaliza Unicode NFC y elimina duplicados sin distinguir mayúsculas. La base limita a 20 elementos y no admite elementos NULL.
El propietario es usuario_id, que en esta arquitectura representa al profesional autenticado.

## Despliegue
Ejecutar npm run db:migrate antes de desplegar. Alternativa: copiar completo docs/sql/aplicar-etiquetas-pacientes.sql a Supabase > SQL Editor > New query y ejecutar como postgres. El script es transaccional y registra el checksum para que el migrador no repita la operación.
No se ha aplicado en producción. Si hay una columna manual previa de tipo distinto o una migración parcialmente aplicada, revisar el error; no borrar datos ni forzar el historial.
Lecturas del listado, ficha y sugerencias admiten esquema antiguo devolviendo []. Guardar etiquetas requiere la migración; si falta, la API responde con error de esquema, sin simular un guardado.

## Uso
Crear/editar paciente: elegir una etiqueta existente o escribir una nueva y pulsar Añadir (o Enter). Editar cambia la etiqueta solo en esa ficha; Quitar la desasigna. Guardar paciente persiste los cambios; Cancelar los descarta.
Badges visibles en tabla, tarjetas y ficha. El filtro Etiqueta se combina con nombre, estado clínico y activo/archivado.
Las sugerencias son etiquetas actualmente asignadas a los pacientes del mismo profesional, incluidos archivados; desaparecen si ningún paciente las usa. No hay catálogo compartido ni renombrado global.

## API y aislamiento
GET /api/pacientes devuelve etiquetas y admite ?etiqueta=...
GET /api/pacientes/etiquetas devuelve solo etiquetas del usuario autenticado.
POST y PUT aceptan etiquetas: string[]. PUT sin etiquetas conserva el valor anterior para clientes antiguos; [] elimina todas.
Las rutas requieren sesión y las escrituras validan origen. Las consultas y actualizaciones mantienen usuario_id. No se cambia la política de acceso de pacientes.
