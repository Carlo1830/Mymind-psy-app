import 'server-only';
import { field,InputError } from '@/lib/api';
import { db } from '@/lib/db';

export function birthDate(value:unknown){
 const date=field(value,'Fecha de nacimiento',10);
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new InputError('Fecha de nacimiento inválida.');
 if(date&&date>new Date().toISOString().slice(0,10))throw new InputError('La fecha de nacimiento no puede ser futura.');
 return date;
}

export async function syncPortalBirth(id:string,date:string|null,database:ReturnType<typeof db>){
 const account=await database.prepare('SELECT fecha_nacimiento::text AS fecha FROM mymind.portal_cuentas WHERE paciente_id=? FOR UPDATE').get(id);
 if(!account)return;
 if(!date)throw new InputError('Este paciente tiene cuenta de portal. Introduce su fecha de nacimiento corregida en lugar de dejarla vacía.');
 if(account.fecha===date)return;
 // A changed identity datum needs a new individual invitation, even if both dates are adult.
 await database.prepare('UPDATE mymind.portal_cuentas SET fecha_nacimiento=?,habilitado=false,version=version+1 WHERE paciente_id=?').run(date,id);
 await database.prepare('DELETE FROM mymind.portal_sesiones WHERE paciente_id=?').run(id);
 await database.prepare('DELETE FROM mymind.portal_enlaces WHERE paciente_id=?').run(id);
 await database.prepare('DELETE FROM mymind.accesos_paciente WHERE paciente_id=?').run(id);
 await database.prepare("INSERT INTO mymind.portal_eventos(paciente_id,actor,accion) VALUES(?,'profesional','fecha_nacimiento_corregida')").run(id);
}

export async function savePatientBirth(id:string,owner:string,date:string|null,database:ReturnType<typeof db>){
 const prior=await database.prepare("SELECT datos->>'fecha_nacimiento' AS fecha FROM mymind.fichas_atencion WHERE paciente_id=? AND usuario_id=?").get(id,owner);
 await syncPortalBirth(id,date,database);
 if((prior?.fecha||null)===date)return;
 const result=await database.prepare(`INSERT INTO mymind.fichas_atencion(paciente_id,usuario_id,datos,actualizado_por)
 VALUES(?,?,?::jsonb,?) ON CONFLICT(paciente_id) DO UPDATE SET
 datos=mymind.fichas_atencion.datos || EXCLUDED.datos,version=mymind.fichas_atencion.version+1,
 actualizado_por=EXCLUDED.actualizado_por,actualizado_en=now() RETURNING version`).get(id,owner,JSON.stringify({fecha_nacimiento:date||''}),owner);
 await database.prepare("INSERT INTO mymind.atencion_eventos(paciente_id,usuario_id,actor_id,accion,recurso_id,version) VALUES(?,?,?,'ficha_actualizada',?,?)").run(id,owner,owner,id,result!.version);
}
