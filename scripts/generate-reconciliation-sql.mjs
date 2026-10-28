import { writeFileSync } from 'node:fs';
import { migrationFiles,canonicalSql,legacyChecksums } from './migration-history.mjs';
import { referenceContracts,catalogSql } from './reconcile-migrations.mjs';

const quote=value=>"'"+value.replaceAll("'","''")+"'";
export async function reconciliationSql({repairChecksums=false,applyGuard=false}={}) {
 const files=migrationFiles(); const contracts=await referenceContracts(files);
 const manifest=files.map(f=>({...f,legacy:repairChecksums?legacyChecksums[f.name]:null,tokens:canonicalSql(f.sql),contract:contracts.get(f.name)}));
 const guard=files.find(f=>f.name==='202610270001_reconcile_schema.sql');
 const applyGuardSql=applyGuard?`DO $forward$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM mymind.schema_migrations WHERE name=${quote(guard.name)}) AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=${quote(guard.version)}) THEN
 EXECUTE ${quote(guard.sql)};
 INSERT INTO mymind.schema_migrations(name,checksum) VALUES(${quote(guard.name)},${quote(guard.checksum)});
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(${quote(guard.version)},${quote(guard.label)},ARRAY[${quote(guard.sql)}]);
 END IF;
 END $forward$;`:'';
 return `-- Generated from committed migration bytes. Do not edit checksums manually.
-- Run in Supabase SQL Editor as postgres. All checks and history writes are atomic.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('mymind:migrations',0));
SET LOCAL search_path=pg_catalog;
CREATE OR REPLACE FUNCTION pg_temp.migration_tokens(input text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE i integer:=1; j integer; depth integer; token text; delimiter text; c text; tokens text[]:=ARRAY[]::text[];
BEGIN
 input:=replace(input,chr(13)||chr(10),chr(10));
 WHILE i<=length(input) LOOP
  c:=substr(input,i,1);
  IF c~'[[:space:]]' OR c=';' THEN i:=i+1; CONTINUE; END IF;
  IF substr(input,i,2)='--' THEN j:=strpos(substr(input,i),chr(10)); IF j=0 THEN EXIT; END IF; i:=i+j; CONTINUE; END IF;
  IF substr(input,i,2)='/*' THEN
   depth:=1; i:=i+2;
   WHILE depth>0 AND i<=length(input) LOOP
    IF substr(input,i,2)='/*' THEN depth:=depth+1;i:=i+2;
    ELSIF substr(input,i,2)='*/' THEN depth:=depth-1;i:=i+2;
    ELSE i:=i+1; END IF;
   END LOOP;
   IF depth<>0 THEN RAISE EXCEPTION 'Unterminated SQL comment'; END IF; CONTINUE;
  END IF;
  IF c=chr(39) OR c=chr(34) THEN
   j:=i+1;
   LOOP
    IF j>length(input) THEN RAISE EXCEPTION 'Unterminated SQL quote'; END IF;
    IF substr(input,j,1)=c THEN
      IF substr(input,j+1,1)=c THEN j:=j+2; ELSE j:=j+1; EXIT; END IF;
    ELSE j:=j+1; END IF;
   END LOOP;
   token:=substr(input,i,j-i);
  ELSIF c='$' AND substring(substr(input,i) FROM '^\\$(?:[A-Za-z_][A-Za-z_0-9]*)?\\$') IS NOT NULL THEN
   delimiter:=substring(substr(input,i) FROM '^(\\$([A-Za-z_][A-Za-z_0-9]*)?\\$)');
   j:=strpos(substr(input,i+length(delimiter)),delimiter);
   IF j=0 THEN RAISE EXCEPTION 'Unterminated dollar quote'; END IF;
   j:=i+2*length(delimiter)+j-1; token:=substr(input,i,j-i);
  ELSE
   token:=substring(substr(input,i) FROM '^[A-Za-z_][A-Za-z_0-9]*');
   token:=coalesce(token,c); j:=i+length(token);
  END IF;
  tokens:=array_append(tokens,token);i:=j;
 END LOOP;
 RETURN array_to_string(tokens,chr(31));
END;
$fn$;
${applyGuardSql}
DO $reconcile$
DECLARE manifest jsonb:=${quote(JSON.stringify(manifest))}::jsonb; f jsonb; pair jsonb; old_checksum text; cli record; actual text; latest jsonb:='{}'::jsonb; adopted integer:=0;
BEGIN
 IF to_regclass('mymind.schema_migrations') IS NULL OR to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'Both existing ledgers are required. Use db:migrate for a fresh database.'; END IF;
 IF EXISTS(SELECT 1 FROM mymind.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest) x WHERE x->>'name'=a.name)) OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest) x WHERE x->>'version'=a.version)) THEN RAISE EXCEPTION 'Database contains migrations missing from this repository snapshot'; END IF;
 FOR f IN SELECT * FROM jsonb_array_elements(manifest) LOOP
   SELECT checksum INTO old_checksum FROM mymind.schema_migrations WHERE name=f->>'name';
   IF old_checksum IS NOT NULL AND old_checksum<>f->>'checksum' AND (old_checksum IS DISTINCT FROM f->>'legacy' OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=f->>'version')) THEN RAISE EXCEPTION 'App checksum differs: %',f->>'name'; END IF;
   SELECT * INTO cli FROM supabase_migrations.schema_migrations WHERE version=f->>'version';
   IF FOUND AND (cli.name IS DISTINCT FROM f->>'label' OR pg_temp.migration_tokens(array_to_string(cli.statements,E';\\n')) IS DISTINCT FROM f->>'tokens') THEN RAISE EXCEPTION 'Supabase SQL differs: %',f->>'name'; END IF;
   IF old_checksum IS NOT NULL OR cli.version IS NOT NULL THEN
     FOR pair IN SELECT * FROM jsonb_array_elements(f->'contract') LOOP latest:=latest||jsonb_build_object(pair->>0,pair->>1); END LOOP;
   END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_array_elements(manifest) LOOP
   IF (NOT EXISTS(SELECT 1 FROM mymind.schema_migrations WHERE name=f->>'name') OR EXISTS(SELECT 1 FROM mymind.schema_migrations WHERE name=f->>'name' AND checksum<>f->>'checksum')) AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=f->>'version') THEN
     FOR pair IN SELECT * FROM jsonb_array_elements(f->'contract') LOOP
       SELECT value INTO actual FROM (${catalogSql}) catalog WHERE key=pair->>0;
       IF actual IS DISTINCT FROM latest->>(pair->>0) THEN RAISE EXCEPTION 'Schema differs for %: %',f->>'name',split_part(pair->>0,':',1)||':'||split_part(pair->>0,':',2); END IF;
     END LOOP;
     IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='mymind' AND tablename IN ('agenda_emails','evaluaciones_clinicas')) THEN RAISE EXCEPTION 'Unexpected access policy on private application table'; END IF;
     SELECT checksum INTO old_checksum FROM mymind.schema_migrations WHERE name=f->>'name';
     IF old_checksum IS NOT NULL THEN
       CREATE TABLE IF NOT EXISTS mymind.migration_reconciliation_audit(name text NOT NULL,old_checksum text NOT NULL,new_checksum text NOT NULL,verified_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(name,old_checksum,new_checksum));
       ALTER TABLE mymind.migration_reconciliation_audit ENABLE ROW LEVEL SECURITY;
       REVOKE ALL ON mymind.migration_reconciliation_audit FROM PUBLIC;
       INSERT INTO mymind.migration_reconciliation_audit(name,old_checksum,new_checksum) VALUES(f->>'name',old_checksum,f->>'checksum') ON CONFLICT DO NOTHING;
       UPDATE mymind.schema_migrations SET checksum=f->>'checksum' WHERE name=f->>'name';
     ELSE INSERT INTO mymind.schema_migrations(name,checksum) VALUES(f->>'name',f->>'checksum'); END IF;
     adopted:=adopted+1;
   END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_array_elements(manifest) LOOP
   IF EXISTS(SELECT 1 FROM mymind.schema_migrations WHERE name=f->>'name') THEN
     INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(f->>'version',f->>'label',ARRAY[f->>'sql']) ON CONFLICT(version) DO NOTHING;
   END IF;
 END LOOP;
 RAISE NOTICE 'Verified and reconciled % migrations. No clinical records changed.',adopted;
END $reconcile$;
COMMIT;
SELECT name,checksum FROM mymind.schema_migrations ORDER BY name;
`;
}
if(process.argv[1]?.endsWith('generate-reconciliation-sql.mjs')) {
 const sql=await reconciliationSql({repairChecksums:process.argv.includes('--repair-checksums'),applyGuard:process.argv.includes('--apply-guard')});
 writeFileSync('docs/sql/reconcile-migration-history.sql',sql);
 console.log('Generated docs/sql/reconcile-migration-history.sql');
}
