"use client";
import { useId,useRef,useState } from 'react';

export function CopyableLink({value,label,hint}:{value:string;label:string;hint?:string}){
 const id=useId();const input=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false);const [copied,setCopied]=useState(false);const [message,setMessage]=useState('');
 async function copy(){
  if(busy)return;setBusy(true);setCopied(false);setMessage('');
  try{
   await navigator.clipboard.writeText(value);
   setCopied(true);setMessage('Enlace copiado. Ya puedes pegarlo para compartirlo con su titular.');
  }catch{
   input.current?.focus();input.current?.select();
   setMessage('No se pudo copiar automáticamente. El enlace quedó seleccionado: cópialo con Ctrl+C o la opción Copiar de tu dispositivo.');
  }finally{setBusy(false);}
 }
 return <div className="mt-4 space-y-2">
  <label htmlFor={id} className="block text-sm">{label}</label>
  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
   <input id={id} ref={input} readOnly className="field min-w-0 flex-1" value={value} onFocus={event=>event.currentTarget.select()}/>
   <button type="button" className="secondary shrink-0" disabled={busy} onClick={()=>void copy()}>{busy?'Copiando…':copied?'Copiado':'Copiar enlace'}</button>
  </div>
  {hint&&<p className="text-xs text-slate-500">{hint}</p>}
  <p role="status" className="text-sm text-teal-900">{message}</p>
 </div>;
}
