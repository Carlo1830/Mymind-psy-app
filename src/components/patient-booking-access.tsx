"use client";
import { useState } from 'react';
import { CopyableLink } from '@/components/copyable-link';
export function PatientBookingAccess({patientId}:{patientId:string}){
 const [link,setLink]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function change(revoke=false){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/pacientes/'+encodeURIComponent(patientId)+'/acceso',{method:revoke?'DELETE':'POST'});
   const result=await response.json();if(!response.ok)throw Error(result.error);
   setLink(revoke?'':new URL('/mi-agenda',window.location.origin).toString()+'#'+new URLSearchParams({token:result.token}));
   setMessage(revoke?'Acceso revocado.':'Enlace creado por 30 días. El enlace anterior quedó revocado.');
  }catch(error){setMessage(error instanceof Error?error.message:'No se pudo gestionar el acceso.');}finally{setBusy(false);}
 }
 return <section className="my-5 rounded-2xl border border-teal-100 p-5" aria-label="Acceso del paciente a sus citas">
  <h3 className="font-semibold text-teal-900">Acceso del paciente a sus citas</h3>
  <p className="my-3 text-sm text-slate-500">Comparte este enlace únicamente con el paciente. Puede elegir horarios y consultar sus solicitudes. Al renovarlo se revoca el anterior.</p>
  <div className="flex flex-wrap gap-3"><button className="secondary" disabled={busy} onClick={()=>void change()}>Crear o renovar enlace privado</button><button className="secondary" disabled={busy} onClick={()=>void change(true)}>Revocar acceso</button></div>
  {link&&<CopyableLink key={link} value={link} label="Enlace privado"/>}
  {message&&<p role="status" className="mt-3 text-sm text-teal-900">{message}</p>}
 </section>;
}
