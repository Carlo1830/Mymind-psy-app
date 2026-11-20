import 'server-only';
import { db } from '@/lib/db';
import { emailReady } from '@/lib/agenda-email';

export async function processRequestNotifications() {
  if (!emailReady()) return {configurado:false,enviados:0};
  let sent=0;
  for (let index=0;index<10;index++) {
    const database=db();
    await database.begin('request-notifications');
    try {
      const job=await database.prepare(`SELECT a.*,r.estado AS solicitud_estado,r.fecha_hora,r.modalidad,r.vence_en,
        p.nombre_completo,p.email AS paciente_email,u.email AS profesional_email,
        COALESCE(c.zona_horaria,'America/Santiago') AS zona
        FROM mymind.avisos_solicitudes a JOIN mymind.solicitudes_cita r ON r.id=a.solicitud_id
        JOIN pacientes p ON p.id=r.paciente_id JOIN usuarios u ON u.id=r.usuario_id
        LEFT JOIN configuracion_sitio c ON c.profesional_id=u.id
        WHERE a.estado='pendiente' AND a.enviar_en<=now() ORDER BY a.creado_en,a.id LIMIT 1 FOR UPDATE OF a`).get();
      if (!job) { await database.exec('COMMIT');break; }
      const currentEmail=job.tipo==='nueva'?job.profesional_email:job.paciente_email;
      const obsolete=job.tipo==='nueva'?job.solicitud_estado!=='pendiente':job.tipo!==job.solicitud_estado;
      if (currentEmail!==job.destinatario || obsolete) {
        await database.prepare("UPDATE mymind.avisos_solicitudes SET estado='omitido' WHERE id=?").run(job.id);
      } else {
        try {
          const date=new Date(String(job.fecha_hora)).toLocaleString('es-CL',{timeZone:String(job.zona),dateStyle:'long',timeStyle:'short'});
          const descriptions: Record<string,string>={aceptada:'Tu solicitud de cita fue confirmada.',rechazada:'Tu solicitud de cita fue rechazada. Puedes elegir otro horario.',alternativa:'Tu profesional propuso otro horario. Revisa tu espacio de citas.',vencida:'Tu solicitud venció sin respuesta. El horario fue liberado y puedes elegir otro.'};
          const origin=process.env.APP_ORIGIN;
          if (!origin) throw Error('Application origin missing');
          const text=job.tipo==='nueva'
            ? `${job.nombre_completo} solicitó una cita para ${date}. Revisa y responde antes de ${new Date(String(job.vence_en)).toLocaleString('es-CL',{timeZone:String(job.zona)})}. ${new URL('/dashboard',origin)}`
            : `${descriptions[String(job.tipo)]} Fecha solicitada: ${date}. Consulta el enlace privado que recibiste al solicitar la cita. EmNós.`;
          const response=await fetch('https://api.resend.com/emails',{
            method:'POST',signal:AbortSignal.timeout(10000),
            headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'solicitud/'+job.id},
            body:JSON.stringify({from:process.env.EMAIL_FROM,to:[job.destinatario],subject:job.tipo==='nueva'?'Nueva solicitud de cita | EmNós':'Respuesta a tu solicitud | EmNós',text})
          });
          if (!response.ok) throw Error('Email rejected');
          const result=await response.json();
          if (typeof result.id!=='string') throw Error('Email response invalid');
          await database.prepare("UPDATE mymind.avisos_solicitudes SET estado='aceptado',proveedor_id=?,intentos=intentos+1 WHERE id=?").run(result.id,job.id);
          sent++;
        } catch {
          const attempts=Number(job.intentos)+1;
          await database.prepare("UPDATE mymind.avisos_solicitudes SET intentos=?,estado=?,enviar_en=now()+interval '5 minutes' WHERE id=?").run(attempts,attempts>=4?'fallido':'pendiente',job.id);
        }
      }
      await database.exec('COMMIT');
    } catch(error) { await database.exec('ROLLBACK');throw error; }
  }
  return {configurado:true,enviados:sent};
}

export async function dispatchRequestNotifications() {
  try { await processRequestNotifications(); } catch { console.error('Request notifications deferred'); }
}
