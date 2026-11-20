"use client";
import { useEffect,useState } from 'react';
import { type BookingRequest,type BookingSlot,type BookingRules,bookingStatus,bookingDate } from '@/types/booking-requests';
type Inbox={solicitudes:BookingRequest[];horarios:BookingSlot[];ajustes:BookingRules;correo_disponible:boolean};
function RequestCard({record,slots,onChanged}:{record:BookingRequest;slots:BookingSlot[];onChanged:()=>void}){
 const [message,setMessage]=useState('');const [alternative,setAlternative]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function answer(action:string){
  if(busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/solicitudes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:record.id,accion:action,mensaje:message,horario_id:alternative})});
   const result=await response.json();if(!response.ok)throw Error(result.error);onChanged();
  }catch(error){setError(error instanceof Error?error.message:'No se pudo responder.');}finally{setBusy(false);}
 }
 return <article className="rounded-2xl border border-teal-100 bg-white p-5">
  <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-teal-900">{record.nombre_completo}</h3><span className="text-xs text-slate-500">{bookingStatus[record.estado]}</span></div>
  <p className="mt-2 text-sm">{bookingDate(record.fecha_hora)} · {record.modalidad} · {record.duracion_minutos} min</p>
  {record.estado==='pendiente'?<fieldset disabled={busy} className="mt-4 space-y-4">
   <p className="text-sm text-amber-900">Responder antes del {bookingDate(record.vence_en)}</p>
   <label className="block text-sm">Mensaje de coordinación para el paciente<textarea maxLength={1000} rows={2} className="field" value={message} onChange={event=>setMessage(event.target.value)}/></label>
   <div className="flex flex-wrap gap-3"><button className="action" onClick={()=>void answer('aceptar')}>Confirmar cita</button><button className="secondary" onClick={()=>void answer('rechazar')}>Rechazar solicitud</button></div>
   <label className="block text-sm">Proponer otro horario<select className="field" value={alternative} onChange={event=>setAlternative(event.target.value)}><option value="">Elige otro horario</option>{slots.map(slot=><option value={slot.id} key={slot.id}>{bookingDate(slot.fecha_hora)} · {slot.modalidad}</option>)}</select></label>
   <p className="text-xs text-slate-500">La propuesta libera el horario original. El paciente deberá solicitar la alternativa si sigue disponible.</p>
   <button className="secondary" disabled={!alternative} onClick={()=>void answer('alternativa')}>Enviar propuesta de horario</button>
  </fieldset>:<>{record.mensaje&&<p className="mt-3 whitespace-pre-wrap text-sm">{record.mensaje}</p>}{record.alternativa_fecha&&<p className="mt-2 text-sm">Alternativa propuesta {bookingDate(record.alternativa_fecha)}</p>}</>}
  {error&&<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
 </article>;
}
export function BookingRequestInbox({settingsOnly=false}:{settingsOnly?:boolean}){
 const [data,setData]=useState<Inbox|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  async function load(){try{const response=await fetch('/api/solicitudes',{cache:'no-store',signal:controller.signal});const value=await response.json();if(!response.ok)throw Error(value.error);setData(value);setError('');}catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'No se pudieron cargar las solicitudes.');}}
  void load();const timer=window.setInterval(load,30000);window.addEventListener('focus',load);
  return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',load);};
 },[revision]);
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;const values=Object.fromEntries(new FormData(event.currentTarget));setBusy(true);setMessage('');
  try{const response=await fetch('/api/solicitudes',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});const result=await response.json();if(!response.ok)throw Error(result.error);setMessage('Plazos guardados. Se aplican a las nuevas solicitudes.');setRevision(value=>value+1);}catch(error){setMessage(error instanceof Error?error.message:'No se pudieron guardar los plazos.');}finally{setBusy(false);}
 }
 const pending=data?.solicitudes.filter(record=>record.estado==='pendiente')||[];
 return <section className="mt-8 border-t border-teal-100 pt-7" aria-label={settingsOnly?'Plazos de solicitudes':'Solicitudes de citas'}>
  <h2 className="font-serif text-2xl text-teal-900">{settingsOnly?'Plazos de solicitudes':'Solicitudes pendientes'}</h2>
  {error?<p role="alert" className="my-4 text-sm text-red-800">{error} <button className="underline" onClick={()=>setRevision(value=>value+1)}>Reintentar solicitudes</button></p>:!data?<p role="status" className="py-5 text-sm">Consultando solicitudes…</p>:<>
   {!data.correo_disponible&&<p className="my-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Los avisos externos están pendientes de configurar la cuenta de envío y el remitente. Revisa las solicitudes en esta pantalla.</p>}
   {settingsOnly?<form onSubmit={save} className="my-5 space-y-4"><fieldset disabled={busy} className="space-y-4">
    <label className="block text-sm">Anticipación mínima para solicitar (horas)<input name="anticipacion_horas" className="field max-w-36" type="number" min={1} max={720} required defaultValue={data.ajustes.solicitud_anticipacion_horas}/></label>
    <label className="block text-sm">Plazo para responder (horas corridas)<input name="respuesta_horas" className="field max-w-36" type="number" min={1} max={72} required defaultValue={data.ajustes.solicitud_respuesta_horas}/></label>
    <p className="text-sm text-slate-500">El plazo corre también por la noche y los fines de semana. Las solicitudes existentes conservan su vencimiento.</p>
    <button className="action">Guardar plazos</button></fieldset>{message&&<p role="status" className="text-sm">{message}</p>}
   </form>:<>
    <p role="status" className="my-4 text-sm text-slate-600">{pending.length?`${pending.length} solicitudes esperando respuesta.`:'No hay solicitudes pendientes.'}</p>
    <div className="space-y-4">{pending.map(record=><RequestCard record={record} slots={data.horarios} key={record.id} onChanged={()=>setRevision(value=>value+1)}/>)}</div>
    <details className="my-5"><summary className="cursor-pointer text-sm text-teal-900">Respuestas recientes</summary><div className="mt-4 space-y-4">{data.solicitudes.filter(record=>record.estado!=='pendiente').map(record=><RequestCard key={record.id} record={record} slots={[]} onChanged={()=>setRevision(value=>value+1)}/>)}</div></details>
   </>}
  </>}
 </section>;
}
