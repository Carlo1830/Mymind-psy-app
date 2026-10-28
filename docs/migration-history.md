# Historial de migraciones

La fuente de verdad es `supabase/migrations` en Git. No editar archivos SQL ya aplicados ni usar `supabase migration repair` para afirmar que se ejecutaron cambios que faltan en la base.

`npm run db:migrate` aplica migraciones nuevas en una transacción y registra el mismo SQL tanto en `mymind.schema_migrations` (SHA-256) como en `supabase_migrations.schema_migrations` (versión y sentencias). Si encuentra SQL distinto o una migración registrada solo por Supabase, se detiene antes de ejecutar DDL.

## Reconciliación ordinaria

Desde la raíz del proyecto, con Node.js 24, `npm ci` y `DIRECT_URL` en `.env.local`:

```sh
npm run db:reconcile
npm run db:reconcile -- --apply
npm run db:migrate
npm run db:check
```

La primera orden solo verifica y muestra el plan; revierte los cambios de su transacción. La segunda adopta únicamente migraciones cuyo SQL en Supabase coincide con el repositorio y cuyas columnas, valores predeterminados, restricciones, índices, funciones, disparadores y RLS se verificaron contra una base temporal creada desde las migraciones. Los nombres de restricciones pueden variar, sus definiciones no. Los datos clínicos no se leen ni exportan.

## Reparación de la instalación de octubre de 2026

Producción tenía dos firmas antiguas distintas, cuatro migraciones adicionales registradas en Supabase y objetos faltantes. La migración nueva `202610270001_reconcile_schema.sql` completa esos objetos sin borrar tablas ni sobrescribir textos clínicos. Los campos administrativos nulos de etiquetas y confirmación reciben los valores de las migraciones originales. Los recordatorios nuevos quedan desactivados.

Para esta instalación se genera el script completo de recuperación:

```sh
npm run db:reconcile:sql -- --repair-checksums --apply-guard
```

Ejecutar **completo** `docs/sql/reconcile-migration-history.sql` en Supabase SQL Editor como `postgres`. El script aplica la migración correctiva y reconcilia ambos historiales en la misma transacción. Si una comprobación falla, todo se revierte. Puede repetirse sin duplicar entradas ni reejecutar la migración correctiva.

`--repair-checksums` solo admite las dos firmas antiguas identificadas en `scripts/migration-history.mjs`; exige SQL equivalente en Supabase y validación de los objetos. Conserva las firmas anteriores en `mymind.migration_reconciliation_audit`. No admite firmas desconocidas. Sin esa opción, cualquier firma distinta provoca un error.

`.gitattributes` conserva LF en SQL para evitar firmas distintas entre Windows y Linux. La comparación de SQL tolera CRLF, comentarios y espaciado entre tokens, pero conserva literales y cuerpos de funciones.

El SQL generado se debe regenerar después de añadir migraciones. No editar el manifiesto ni las firmas del archivo generado a mano. Los despliegues no ejecutan migraciones durante el build.

## Comprobaciones

`npm run db:test` verifica instalación vacía, conservación de datos, rechazo ante deriva de esquema/SQL, reconciliación sin escritura por defecto, auditoría de firmas antiguas, ruta SQL Editor y repetición de migraciones. Estas pruebas usan una base temporal y nunca el proyecto Supabase.
