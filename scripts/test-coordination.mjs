import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { recurrenceDates } from '../src/lib/recurrence.ts';
import { confirmationToken,validConfirmation } from '../src/lib/confirmation-token.ts';
import { verifyEmailWebhook } from '../src/lib/email-webhook.ts';
test('weekly recurrence preserves Santiago wall time across DST and validates bounds',()=>{
 const dates=recurrenceDates('2027-04-03T13:00:00.000Z',3,1,'America/Santiago');
 assert.equal(dates[1],'2027-04-10T14:00:00.000Z');
 assert.equal(dates[2],'2027-04-17T14:00:00.000Z');
 assert.throws(()=>recurrenceDates(dates[0],53,1,'America/Santiago'));
 assert.throws(()=>recurrenceDates(dates[0],2,3,'America/Santiago'));
 assert.throws(()=>recurrenceDates(dates[0],2,1,'bad/zone'));
 assert.throws(()=>recurrenceDates('2027-03-07T07:30:00.000Z',2,1,'America/New_York'),/inexistente/);
 assert.throws(()=>recurrenceDates('2027-10-31T05:30:00.000Z',2,1,'America/New_York'),/ambigua/);
});
test('confirmation tokens bind to the precise appointment revision',()=>{
 process.env.AGENDA_CONFIRMATION_SECRET='synthetic-test-key';
 const args=['s','2099-01-01T12:00:00.000Z','Online',50];const token=confirmationToken(...args);
 assert.ok(validConfirmation(token,...args));
 assert.equal(validConfirmation(token,'s','2099-01-02T12:00:00.000Z','Online',50),false);
 assert.equal(validConfirmation(token,'other',args[1],'Online',50),false);
 assert.equal(validConfirmation(token,'s',args[1],'Presencial',50),false);
 assert.equal(validConfirmation(token,'s',args[1],'Online',60),false);
 assert.equal(validConfirmation('malformed',...args),false);
 assert.equal(validConfirmation(token,'s',args[1],'Online',50,1),false);
});
test('delivery webhook rejects forged, altered, and expired signatures',()=>{
 const secret='whsec_'+Buffer.from('synthetic-webhook-key').toString('base64');const now=Date.now();const timestamp=String(Math.floor(now/1000));const raw=JSON.stringify({type:'email.delivered'});
 const signature=createHmac('sha256',Buffer.from('synthetic-webhook-key')).update(`event.${timestamp}.${raw}`).digest('base64');
 const headers=new Headers({'svix-id':'event','svix-timestamp':timestamp,'svix-signature':'v1,'+signature});
 assert.ok(verifyEmailWebhook(raw,headers,secret,now));
 assert.equal(verifyEmailWebhook(raw+' ',headers,secret,now),false);
 assert.equal(verifyEmailWebhook(raw,headers,secret,now+301000),false);
});

test('email queue retries, records acceptance, skips cancelled appointments and preserves patient confirmation',async()=>{
 const {testPostgres}=await import('./test-postgres-helper.mjs');
 const {Database,closePool}=await import('../database/postgres.mjs');
 const {processAgendaQueue}=await import('../database/agenda-worker.mjs');
 const instance=await testPostgres(55445);process.env.DATABASE_URL=instance.url;const c=instance.client;
 try{
  await c.query("INSERT INTO mymind.usuarios(id,email,password_hash,nombre,recordatorios_email) VALUES('mail-owner','test@example.test','none','Synthetic',true)");
  await c.query("INSERT INTO mymind.pacientes(id,usuario_id,nombre_completo,email) VALUES('mail-patient','mail-owner','Synthetic','recipient@example.test')");
  await c.query("INSERT INTO mymind.sesiones(id,paciente_id,fecha_hora,estado_sesion) VALUES('mail-session','mail-patient','2099-01-01T12:00:00Z','Programada')");
  await c.query("UPDATE mymind.sesiones SET estado_confirmacion='confirmada',confirmada_en=now(),confirmacion_fuente='paciente' WHERE id='mail-session'");
  const factory=()=>new Database();let calls=0;
  const fail=async()=>{calls++;throw Error('synthetic outage');};
  await processAgendaQueue({databaseFactory:factory,send:fail});
  let job=(await c.query("SELECT * FROM mymind.agenda_emails WHERE tipo='confirmacion'")).rows[0];
  assert.equal(job.estado,'pendiente');assert.equal(job.intentos,1);assert.ok(Date.parse(job.enviar_en)>Date.now());
  await c.query("UPDATE mymind.agenda_emails SET enviar_en=now()-interval '1 minute' WHERE tipo='confirmacion'");
  let key;const success=async input=>{key=input.id;return 'provider-synthetic';};
  await processAgendaQueue({databaseFactory:factory,send:success});
  job=(await c.query("SELECT * FROM mymind.agenda_emails WHERE tipo='confirmacion'")).rows[0];
  assert.equal(job.estado,'enviado');assert.equal(job.entrega,'aceptado');assert.equal(job.intentos,2);assert.ok(key.startsWith(job.id+'/'));
  await c.query("UPDATE mymind.agenda_emails SET enviar_en=now()-interval '1 minute',intentos=3 WHERE tipo='recordatorio'");
  await processAgendaQueue({databaseFactory:factory,send:fail});
  job=(await c.query("SELECT * FROM mymind.agenda_emails WHERE tipo='recordatorio'")).rows[0];assert.equal(job.estado,'fallido');assert.equal(job.intentos,4);
  assert.equal((await c.query("SELECT estado_confirmacion FROM mymind.sesiones WHERE id='mail-session'")).rows[0].estado_confirmacion,'confirmada');
  await c.query("UPDATE mymind.sesiones SET modalidad='Online' WHERE id='mail-session'");
  job=(await c.query("SELECT * FROM mymind.agenda_emails WHERE tipo='confirmacion'")).rows[0];assert.equal(job.estado,'pendiente');assert.equal(job.intentos,0);assert.equal(job.proveedor_id,null);
  assert.equal((await c.query("SELECT estado_confirmacion FROM mymind.sesiones WHERE id='mail-session'")).rows[0].estado_confirmacion,'pendiente');
  await c.query("UPDATE mymind.sesiones SET estado_sesion='Cancelada' WHERE id='mail-session'");
  const before=calls;await processAgendaQueue({databaseFactory:factory,send:fail});assert.equal(calls,before);
  assert.equal((await c.query("SELECT count(*)::int AS n FROM mymind.agenda_emails WHERE estado='pendiente'")).rows[0].n,0);
 }finally{await closePool();await instance.close();}
});
