"use client";
import { useRef,useState } from 'react';
import { type BookingSlot,type BookingRules,type BookingRequest,bookingDate,randomTrackingToken } from '@/types/booking-requests';

export function RequestBookingForm({slots,zone,rules,patientToken,onSaved,preferredSlot=''}:{
 slots:BookingSlot[];zone:string;rules:BookingRules;patientToken?:string;preferredSlot?:string;
 onSaved:(record:BookingRequest,tracking:string)=>void;
}){
 const [slotId,setSlotId]=useState(preferredSlot);const [modality,setModality]=useState('Online');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const requestId=useRef('');const tracking=useRef('');
 const selected=slots.find(slot=>slot.id===slotId);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!selected||busy)return;
  const values=Object.fromEntries(new FormData(event.currentTarget));
  requestId.current||=crypto.randomUUID();tracking.current||=randomTrackingToken();
  setBusy(true);setError('');
  try{
   const response=await fetch(patientToken?'/api/mi-agenda':'/api/reservas',{
    method:'POST',headers:{'Content-Type':'application/json',...(patientToken?{'x-patient-token':patientToken}:{})},
    body:JSON.stringify({...values,consentimiento:values.consentimiento==='on',horario_id:selected.id,
     modalidad:selected.modalidad==='Ambas'?modality:selected.modalidad,solicitud_id:requestId.current,seguimiento:tracking.current})
   });
   const result=await response.json();if(!response.ok)throw Error(result.error);
   onSaved(result,tracking.current);requestId.current='';tracking.current='';
  }catch(error){setError(error instanceof Error?error.message:'No se pudo solicitar la cita.');}finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="space-y-4">
  <p className="text-sm text-slate-600">Solicita con {rules.solicitud_anticipacion_horas} horas de anticipación. Tu profesional tiene {rules.solicitud_respuesta_horas} horas corridas para responder, también durante la noche.</p>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {!slots.length?<p className="py-5 text-sm text-slate-500">No hay horarios disponibles con la anticipación requerida.</p>:<fieldset disabled={busy} className="space-y-4">
   <label className="block text-sm">Día y hora disponibles<select className="field" required value={slotId} onChange={event=>{setSlotId(event.target.value);requestId.current='';tracking.current='';}}>
    <option value="">Selecciona un horario</option>{slots.map(slot=><option key={slot.id} value={slot.id}>{bookingDate(slot.fecha_hora,zone)} · {slot.duracion_minutos} min</option>)}
   </select><span className="mt-1 block text-xs text-slate-500">Zona horaria {zone}</span></label>
   {selected&&<label className="block text-sm">Modalidad<select className="field" value={selected.modalidad==='Ambas'?modality:selected.modalidad} onChange={event=>setModality(event.target.value)}>
    {(selected.modalidad==='Ambas'?['Online','Presencial']:[selected.modalidad]).map(option=><option key={option}>{option}</option>)}
   </select></label>}
   {!patientToken&&<>
    <label className="block text-sm">Nombre completo<input name="nombre_completo" required maxLength={200} autoComplete="name" className="field"/></label>
    <label className="block text-sm">Correo electrónico<input name="email" type="email" required maxLength={254} autoComplete="email" className="field"/></label>
    <label className="block text-sm">Teléfono (opcional)<input name="telefono" type="tel" maxLength={50} className="field"/></label>
    <div hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
   </>}
   <label className="flex gap-3 text-xs leading-5 text-slate-600"><input type="checkbox" name="consentimiento" required className="mt-1"/>Autorizo el uso de mis datos de contacto para gestionar esta solicitud.</label>
   <button className="action" disabled={!selected}>{busy?'Enviando…':'Solicitar cita'}</button>
  </fieldset>}
 </form>;
}

export function RequestSummary({record,zone}:{record:BookingRequest;zone?:string}){
 const appointment=record.estado==='aceptada'&&record.cita?record.cita:record;
 const labels={pendiente:'Pendiente de confirmación',aceptada:'Cita confirmada',rechazada:'Solicitud rechazada',alternativa:'Otro horario propuesto',vencida:'Solicitud vencida'};
 return <article className="rounded-2xl border border-teal-100 bg-white p-5">
  <h3 className="font-semibold text-teal-900">{record.cita?.estado==='Cancelada'?'Cita cancelada':labels[record.estado]}</h3>
  <p className="mt-2 text-sm">{bookingDate(appointment.fecha_hora,zone)} · {appointment.modalidad} · {appointment.duracion_minutos} min</p>
  {record.estado==='pendiente'&&<p className="mt-3 text-sm text-slate-600">El horario queda reservado hasta {bookingDate(record.vence_en,zone)} mientras tu profesional responde.</p>}
  {record.estado==='aceptada'&&record.cita?.estado!=='Cancelada'&&<p className="mt-3 text-sm text-slate-600">Tu profesional te indicará cómo realizar el pago de esta cita.</p>}
  {record.estado==='vencida'&&<p className="mt-3 text-sm text-slate-600">Se agotó el plazo de respuesta y el horario fue liberado. Puedes solicitar otra cita.</p>}
  {record.estado==='rechazada'&&<p className="mt-3 text-sm text-slate-600">Puedes elegir otro horario disponible.</p>}
  {record.alternativa_fecha&&<p className="mt-3 text-sm text-teal-900">Horario propuesto {bookingDate(record.alternativa_fecha,zone)}. Puedes solicitarlo si sigue disponible.</p>}
  {record.mensaje&&<p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{record.mensaje}</p>}
 </article>;
}
