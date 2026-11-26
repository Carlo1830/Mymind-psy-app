"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
export function PatientPortalRequests(){
 const [items,setItems]=useState<{id:string;paciente_id:string;nombre_completo:string;tipo:string}[]>([]);const [error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();async function load(){try{const response=await fetch('/api/paciente/pendientes',{cache:'no-store',signal:controller.signal});const value=await response.json();if(!response.ok)throw Error(value.error);setItems(value);setError('');}catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'No se pudieron consultar los pedidos de ficha.');}}void load();const timer=window.setInterval(load,30000);return()=>{controller.abort();window.clearInterval(timer);};},[]);
 if(error)return <p role="alert" className="mt-5 text-sm text-red-800">{error}</p>;
 if(!items.length)return null;
 return <section className="mt-7 rounded-2xl border border-amber-100 bg-amber-50/40 p-5"><h2 className="font-serif text-2xl text-teal-900">Pedidos de ficha del portal</h2><ul className="mt-4 space-y-3">{items.map(item=><li key={item.id} className="text-sm"><Link className="text-teal-900 underline" href={'/pacientes?paciente='+encodeURIComponent(item.paciente_id)}>{item.nombre_completo}: {item.tipo==='acceso_prontuario'?'acceso al prontuario':'corrección de datos'}</Link></li>)}</ul></section>;
}
