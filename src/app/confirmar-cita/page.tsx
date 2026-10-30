'use client';
import { useState } from 'react';
export default function ConfirmAppointment() {
 const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
 async function confirm(){setBusy(true);try{const p=new URLSearchParams(location.hash.slice(1));const r=await fetch('/api/agenda/confirmar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.get('id'),token:p.get('token')})});const v=await r.json();if(!r.ok)throw Error(v.error);setDone(true);setMessage('Tu asistencia está confirmada. Gracias.');history.replaceState(null,'','/confirmar-cita');}catch(e){setMessage(e instanceof Error?e.message:'No se pudo confirmar.');}finally{setBusy(false);}}
 return <main className="mx-auto max-w-xl p-8"><h1 className="font-serif text-3xl">Confirma tu asistencia</h1><p className="my-5">Pulsa el botón para avisar a tu profesional que asistirás a la cita indicada en tu correo.</p>{!done&&<button className="action" disabled={busy} onClick={confirm}>{busy?'Confirmando…':'Confirmar mi asistencia'}</button>}{message&&<p role="status" className="mt-4">{message}</p>}</main>;
}
