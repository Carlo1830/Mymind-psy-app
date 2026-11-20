"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { RequestBookingForm,RequestSummary } from '@/components/request-booking-form';
import type { BookingSlot,BookingRules,BookingRequest } from '@/types/booking-requests';
type Portal={nombre:string;profesional:string;zona_horaria:string;horarios:BookingSlot[];solicitudes:BookingRequest[];ajustes:BookingRules};
export function PatientBookingPortal({trackingOnly=false}:{trackingOnly?:boolean}){
 const [token,setToken]=useState('');const [data,setData]=useState<Portal|null>(null);const [record,setRecord]=useState<BookingRequest|null>(null);
 const [error,setError]=useState('');const [revision,setRevision]=useState(0);const [preferred,setPreferred]=useState('');const [notice,setNotice]=useState('');
 useEffect(()=>{const readToken=()=>setToken(new URLSearchParams(window.location.hash.slice(1)).get('token')||'');const timer=window.setTimeout(readToken,0);window.addEventListener('hashchange',readToken);return()=>{window.clearTimeout(timer);window.removeEventListener('hashchange',readToken);};},[]);
 useEffect(()=>{
  if(!token)return;
  const controller=new AbortController();
  async function load(){
   try{
    const response=await fetch(trackingOnly?'/api/solicitudes/estado':'/api/mi-agenda',{
     cache:'no-store',signal:controller.signal,headers:trackingOnly?{'x-request-token':token}:{'x-patient-token':token}
    });
    const value=await response.json();if(!response.ok)throw Error(value.error);
    if(trackingOnly)setRecord(value);else setData(value);setError('');
   }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'No se pudo cargar tu agenda.');}
  }
  void load();const timer=window.setInterval(load,30000);
  return()=>{controller.abort();window.clearInterval(timer);};
 },[token,revision,trackingOnly]);
 return <div className="mx-auto max-w-3xl space-y-6 py-5">
  <header><p className="text-sm text-teal-800">EmNós</p><h1 className="mt-3 font-serif text-3xl">{trackingOnly?'Mi solicitud de cita':'Mis citas'}</h1>{data&&<p className="mt-2 text-sm text-slate-600">Hola, {data.nombre}. Consulta con {data.profesional}.</p>}</header>
  {!token?<p role="status">Abre el enlace privado que te compartió tu profesional o que guardaste al solicitar tu cita.</p>:error?<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>:trackingOnly?record?<RequestSummary record={record}/>:<p role="status">Consultando solicitud…</p>:data?<>
   {notice&&<p role="status" className="rounded-xl bg-teal-50 p-4 text-teal-900">{notice}</p>}
   <section className="panel"><h2 className="mb-4 font-serif text-2xl">Elegir una cita</h2>
    <RequestBookingForm key={preferred+':'+revision} slots={data.horarios} zone={data.zona_horaria} rules={data.ajustes} patientToken={token} preferredSlot={preferred}
     onSaved={()=>{setNotice('Solicitud recibida. Tu profesional debe confirmarla antes del plazo indicado.');setPreferred('');setRevision(value=>value+1);}}/>
   </section>
   <section><h2 className="mb-4 font-serif text-2xl">Mis solicitudes</h2>
    {!data.solicitudes.length&&<p className="text-sm text-slate-500">Todavía no tienes solicitudes.</p>}
    <div className="space-y-4">{data.solicitudes.map(request=><div key={request.id}>
     <RequestSummary record={request} zone={data.zona_horaria}/>
     {request.estado==='alternativa'&&request.alternativa_horario_id&&data.horarios.some(slot=>slot.id===request.alternativa_horario_id)&&
      <button className="secondary mt-2" onClick={()=>{setPreferred(request.alternativa_horario_id!);document.getElementById('contenido')?.scrollIntoView();}}>Elegir el horario propuesto</button>}
    </div>)}</div>
   </section>
  </>:<p role="status">Consultando tu agenda…</p>}
  {token&&<button className="secondary" onClick={()=>setRevision(value=>value+1)}>Actualizar estado</button>}
  {trackingOnly&&<Link className="ml-4 text-sm text-teal-800 underline" href="/#reservar">Consultar disponibilidad</Link>}
  <p className="text-xs text-slate-500">Este enlace es privado. Compártelo únicamente con tu profesional.</p>
 </div>;
}
