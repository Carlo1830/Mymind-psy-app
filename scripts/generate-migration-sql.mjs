import { writeFileSync } from 'node:fs';
import { migrationFiles } from './migration-history.mjs';

// SQL Editor delivery of the next migration, with the same two ledgers as db:migrate.
export function pendingMigrationSql() {
 const files=migrationFiles();
 const next=files.at(-1);
 const quote=s=>"'"+s.replaceAll("'","''")+"'";
 const manifest=JSON.stringify(files.map(({name,version,label,checksum})=>({name,version,label,checksum})));
 return `-- Generated from repository migration bytes. Run as postgres before deploying the app.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0));
DO $apply$
DECLARE expected jsonb:=${quote(manifest)}::jsonb; item jsonb; app_hash text; cli_name text; cli_sql text;
 source_sql text:=replace(${quote(next.sql)},chr(13)||chr(10),chr(10));
BEGIN
 IF EXISTS(SELECT 1 FROM mymind.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'name'=a.name))
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'version'=a.version)) THEN
 RAISE EXCEPTION 'Repository is missing applied migrations'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(expected) LOOP
  SELECT checksum INTO app_hash FROM mymind.schema_migrations WHERE name=item->>'name';
  SELECT name,array_to_string(statements,E';\\n') INTO cli_name,cli_sql FROM supabase_migrations.schema_migrations WHERE version=item->>'version';
  IF item->>'name'<>${quote(next.name)} THEN
   IF app_hash IS DISTINCT FROM item->>'checksum' OR cli_name IS DISTINCT FROM item->>'label' OR cli_sql IS NULL THEN RAISE EXCEPTION 'Reconcile previous migration first: %',item->>'name'; END IF;
  ELSE
   IF app_hash IS NOT NULL OR cli_name IS NOT NULL THEN
    IF app_hash IS DISTINCT FROM item->>'checksum' OR cli_name IS DISTINCT FROM item->>'label' OR replace(cli_sql,chr(13)||chr(10),chr(10)) IS DISTINCT FROM source_sql THEN RAISE EXCEPTION 'Migration history mismatch: %',item->>'name'; END IF;
   ELSE
    IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=item->>'version') THEN RAISE EXCEPTION 'Reconcile CLI history first'; END IF;
    EXECUTE source_sql;
    INSERT INTO mymind.schema_migrations(name,checksum) VALUES(item->>'name',item->>'checksum');
    INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(item->>'version',item->>'label',ARRAY[source_sql]);
   END IF;
  END IF;
 END LOOP;
END $apply$;
COMMIT;
SELECT name,checksum FROM mymind.schema_migrations ORDER BY name;
`;
}
if(process.argv[1]?.endsWith('generate-migration-sql.mjs')) {
 writeFileSync('docs/sql/apply-clinical-care.sql',pendingMigrationSql());
 console.log('Generated docs/sql/apply-clinical-care.sql');
}
