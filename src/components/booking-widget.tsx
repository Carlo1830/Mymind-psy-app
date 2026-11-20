"use client";
import { useEffect,useState } from 'react';
import { RequestBookingForm,RequestSummary } from '@/components/request-booking-form';
import type { BookingSlot,BookingRules,BookingRequest } from '@/types/booking-requests';
type Availability={horarios:BookingSlot[];zona_horaria:string;ajustes:BookingRules};
export function BookingWidget(){
 const [data,setData]=useState<Availability|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 const [saved,setSaved]=useState<BookingRequest|null>(null);const [trackingLink,setTrackingLink]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/reservas/disponibilidad',{cache:'no-store',signal:controller.signal}).then(async response=>{
   const value=await response.json();if(!response.ok)throw Error(value.error);setData(value);setError('');
  }).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
  return()=>controller.abort();
 },[revision]);
 return <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
  <h3 className="mb-5 font-serif text-2xl text-teal-900">Solicita tu cita</h3>
  {error?<p role="alert" className="text-sm text-red-700">{error}</p>:saved?<div className="space-y-4">
   <RequestSummary record={saved} zone={data?.zona_horaria}/>
   <p className="text-sm">Guarda este enlace privado para consultar la respuesta de tu profesional.</p>
   <a href={trackingLink} className="action">Ver mi solicitud</a>
  </div>:data?<RequestBookingForm slots={data.horarios} zone={data.zona_horaria} rules={data.ajustes||{solicitud_anticipacion_horas:24,solicitud_respuesta_horas:6}}
   onSaved={(record,token)=>{setSaved(record);setTrackingLink('/mi-cita#'+new URLSearchParams({token}));}}/>:<p role="status">Consultando disponibilidad…</p>}
  {!saved&&<button className="mt-4 text-sm text-teal-800 underline" onClick={()=>setRevision(value=>value+1)}>Actualizar disponibilidad</button>}
 </section>;
}
