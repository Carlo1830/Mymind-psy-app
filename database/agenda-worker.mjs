export async function processAgendaQueue({ databaseFactory, send, now = Date.now }) {
 let sent=0,failed=0,retried=0;
 for(let i=0;i<10;i++){
  const database=databaseFactory(); await database.begin('agenda-email-worker');
  try{
   const job=await database.prepare("SELECT j.*, s.estado_sesion, s.fecha_hora, s.duracion_minutos, s.confirmacion_version, s.modalidad AS actual_modalidad, p.email AS actual_email, u.recordatorios_email FROM mymind.agenda_emails j JOIN sesiones s ON s.id=j.sesion_id JOIN pacientes p ON p.id=s.paciente_id JOIN usuarios u ON u.id=p.usuario_id WHERE j.estado='pendiente' AND j.enviar_en<=now() ORDER BY j.enviar_en,j.id LIMIT 1 FOR UPDATE OF j,s,p,u").get();
   if(!job){await database.exec('COMMIT');break;}
   if(!job.recordatorios_email || job.estado_sesion!=='Programada' || job.fecha_cita!==job.fecha_hora || job.destinatario!==job.actual_email || job.modalidad!==job.actual_modalidad || Date.parse(String(job.fecha_cita))<=now()){
    await database.prepare("UPDATE mymind.agenda_emails SET estado='omitido' WHERE id=?").run(job.id);
   }else if(now()-Date.parse(String(job.primer_intento_en))>23*3600000 && Number(job.intentos)>0){
    await database.prepare("UPDATE mymind.agenda_emails SET estado='fallido',ultimo_error='Ventana de reintento agotada' WHERE id=?").run(job.id);failed++;
   }else{
    try{
     const providerId=await send({id:String(job.id)+'/'+String(job.creado_en),to:String(job.destinatario),date:String(job.fecha_cita),zone:String(job.zona_horaria),modality:String(job.modalidad),reminder:job.tipo==='recordatorio',sessionId:String(job.sesion_id),duration:Number(job.duracion_minutos),revision:Number(job.confirmacion_version)});
     await database.prepare("UPDATE mymind.agenda_emails SET estado='enviado',entrega='aceptado',proveedor_id=?,enviado_en=now(),intentos=intentos+1,ultimo_error=NULL WHERE id=?").run(providerId,job.id);
     // Delivery of a reminder never changes the patient's confirmation.
     sent++;
    }catch{
     const attempts=Number(job.intentos)+1;
     await database.prepare("UPDATE mymind.agenda_emails SET primer_intento_en=COALESCE(primer_intento_en,now()),intentos=?,estado=?,enviar_en=now()+(? * interval '1 minute'),ultimo_error='El proveedor no confirmó la aceptación' WHERE id=?").run(attempts,attempts>=4?'fallido':'pendiente',Math.pow(5,attempts),job.id);
     if(attempts>=4)failed++;else retried++;
    }
   }
   await database.exec('COMMIT');
  }catch(error){await database.exec('ROLLBACK');throw error;}
 }
 return {configured:true,sent,failed,retried};
}
