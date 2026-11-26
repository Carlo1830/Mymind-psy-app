"use client";
import { useRef,useState } from 'react';
import { type BookingSlot,type BookingRules,type BookingRequest,bookingDate,randomTrackingToken } from '@/types/booking-requests';

export function RequestBookingForm({slots,zone,rules,patientToken,onSaved,preferredSlot='',sessionAuth=false,language='es'}:{
 slots:BookingSlot[];zone:string;rules:BookingRules;patientToken?:string;preferredSlot?:string;sessionAuth?:boolean;language?:'es'|'pt';
 onSaved:(record:BookingRequest,tracking:string)=>void;
}){
 const [slotId,setSlotId]=useState(preferredSlot);const [modality,setModality]=useState('Online');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const requestId=useRef('');const tracking=useRef('');
 const selected=slots.find(slot=>slot.id===slotId);
 const pt=language==='pt';const date=(s:string)=>pt?new Date(s).toLocaleString('pt-BR',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}):bookingDate(s,zone);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!selected||busy)return;
  const values=Object.fromEntries(new FormData(event.currentTarget));
  requestId.current||=crypto.randomUUID();tracking.current||=randomTrackingToken();
  setBusy(true);setError('');
  try{
   const response=await fetch(patientToken||sessionAuth?'/api/mi-agenda':'/api/reservas',{
    method:'POST',headers:{'Content-Type':'application/json',...(patientToken?{'x-patient-token':patientToken}:{})},
    body:JSON.stringify({...values,consentimiento:values.consentimiento==='on',horario_id:selected.id,
     modalidad:selected.modalidad==='Ambas'?modality:selected.modalidad,solicitud_id:requestId.current,seguimiento:tracking.current})
   });
   const result=await response.json();if(!response.ok)throw Error(result.error);
   onSaved(result,tracking.current);requestId.current='';tracking.current='';
  }catch(error){setError(error instanceof Error?error.message:'No se pudo solicitar la cita.');}finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="space-y-4">
  <p className="text-sm text-slate-600">{pt?`Solicite com pelo menos ${rules.solicitud_anticipacion_horas} horas de antecedência. Sua profissional tem ${rules.solicitud_respuesta_horas} horas corridas para responder, inclusive à noite.`:`Solicita con ${rules.solicitud_anticipacion_horas} horas de anticipación. Tu profesional tiene ${rules.solicitud_respuesta_horas} horas corridas para responder, también durante la noche.`}</p>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {!slots.length?<p className="py-5 text-sm text-slate-500">{pt?'Não há horários disponíveis com a antecedência necessária.':'No hay horarios disponibles con la anticipación requerida.'}</p>:<fieldset disabled={busy} className="space-y-4">
   <label className="block text-sm">{pt?'Dias e horários disponíveis':'Día y hora disponibles'}<select className="field" required value={slotId} onChange={event=>{setSlotId(event.target.value);requestId.current='';tracking.current='';}}>
    <option value="">{pt?'Selecione um horário':'Selecciona un horario'}</option>{slots.map(slot=><option key={slot.id} value={slot.id}>{date(slot.fecha_hora)} · {slot.duracion_minutos} min</option>)}
   </select><span className="mt-1 block text-xs text-slate-500">{pt?'Fuso horário':'Zona horaria'} {zone}</span></label>
   {selected&&<label className="block text-sm">Modalidad<select className="field" value={selected.modalidad==='Ambas'?modality:selected.modalidad} onChange={event=>setModality(event.target.value)}>
    {(selected.modalidad==='Ambas'?['Online','Presencial']:[selected.modalidad]).map(option=><option key={option}>{option}</option>)}
   </select></label>}
   {!patientToken&&!sessionAuth&&<>
    <label className="block text-sm">Nombre completo<input name="nombre_completo" required maxLength={200} autoComplete="name" className="field"/></label>
    <label className="block text-sm">Correo electrónico<input name="email" type="email" required maxLength={254} autoComplete="email" className="field"/></label>
    <label className="block text-sm">Teléfono (opcional)<input name="telefono" type="tel" maxLength={50} className="field"/></label>
    <div hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
   </>}
   <label className="flex gap-3 text-xs leading-5 text-slate-600"><input type="checkbox" name="consentimiento" required className="mt-1"/>{pt?'Autorizo o uso dos meus dados de contato para gerenciar esta solicitação.':'Autorizo el uso de mis datos de contacto para gestionar esta solicitud.'}</label>
   <button className="action" disabled={!selected}>{busy?'Enviando…':pt?'Solicitar consulta':'Solicitar cita'}</button>
  </fieldset>}
 </form>;
}

export function RequestSummary({record,zone,language='es'}:{record:BookingRequest;zone?:string;language?:'es'|'pt'}){
 const pt=language==='pt';const date=(s:string)=>pt?new Date(s).toLocaleString('pt-BR',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}):bookingDate(s,zone);
 const appointment=record.estado==='aceptada'&&record.cita?record.cita:record;
 const labels=pt?{pendiente:'Aguardando confirmação',aceptada:'Consulta confirmada',rechazada:'Solicitação recusada',alternativa:'Outro horário proposto',vencida:'Solicitação expirada'}:{pendiente:'Pendiente de confirmación',aceptada:'Cita confirmada',rechazada:'Solicitud rechazada',alternativa:'Otro horario propuesto',vencida:'Solicitud vencida'};
 return <article className="rounded-2xl border border-teal-100 bg-white p-5">
  <h3 className="font-semibold text-teal-900">{record.cita?.estado==='Cancelada'?(pt?'Consulta cancelada':'Cita cancelada'):labels[record.estado]}</h3>
  <p className="mt-2 text-sm">{date(appointment.fecha_hora)} · {appointment.modalidad} · {appointment.duracion_minutos} min</p>
  {record.estado==='pendiente'&&<p className="mt-3 text-sm text-slate-600">{pt?`O horário fica reservado até ${date(record.vence_en)} enquanto sua profissional responde.`:`El horario queda reservado hasta ${date(record.vence_en)} mientras tu profesional responde.`}</p>}
  {record.estado==='aceptada'&&record.cita?.estado!=='Cancelada'&&<p className="mt-3 text-sm text-slate-600">{pt?'Sua profissional informará como realizar o pagamento desta consulta.':'Tu profesional te indicará cómo realizar el pago de esta cita.'}</p>}
  {record.estado==='vencida'&&<p className="mt-3 text-sm text-slate-600">{pt?'O prazo de resposta terminou e o horário foi liberado. Você pode solicitar outra consulta.':'Se agotó el plazo de respuesta y el horario fue liberado. Puedes solicitar otra cita.'}</p>}
  {record.estado==='rechazada'&&<p className="mt-3 text-sm text-slate-600">{pt?'Você pode escolher outro horário disponível.':'Puedes elegir otro horario disponible.'}</p>}
  {record.alternativa_fecha&&<p className="mt-3 text-sm text-teal-900">{pt?`Horário proposto: ${date(record.alternativa_fecha)}. Você pode solicitá-lo se ainda estiver disponível.`:`Horario propuesto ${date(record.alternativa_fecha)}. Puedes solicitarlo si sigue disponible.`}</p>}
  {record.mensaje&&<p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{record.mensaje}</p>}
 </article>;
}
