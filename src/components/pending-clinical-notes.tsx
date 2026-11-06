"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';

type PendingNote = {
  id: string; paciente_id: string; sesion_id: string; nombre_completo: string;
  fecha_hora: string; actualizado_en: string; estado_sesion: string; paciente_status: string;
};
type PendingNotes = { total: number; notas: PendingNote[] };

export function PendingClinicalNotes() {
  const [data, setData] = useState<PendingNotes | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/atencion/pendientes', { cache: 'no-store', signal: controller.signal });
        const value = await response.json();
        if (!response.ok) throw Error(value.error || 'No se pudieron cargar las notas pendientes.');
        if (!controller.signal.aborted) { setData(value); setError(''); }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se pudieron cargar las notas pendientes.');
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    window.addEventListener('focus', load);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', load); };
  }, [revision]);

  return <section aria-labelledby="pending-notes-title" className="mt-10 border-t border-slate-200/70 pt-7">
    <h2 id="pending-notes-title" className="font-serif text-2xl text-slate-700">Notas de sesión pendientes</h2>
    <p className="mt-2 text-sm text-slate-500">Retoma los borradores guardados y revísalos antes de finalizar cada sesión.</p>
    {error ? <p role="alert" className="mt-4 rounded-2xl bg-amber-50 p-5 text-sm text-amber-900">{error} <button className="ml-2 underline" onClick={() => setRevision(value => value + 1)}>Reintentar notas pendientes</button></p>
      : !data ? <p role="status" className="py-6 text-sm text-slate-500">Consultando notas pendientes.</p>
      : data.total === 0 ? <p className="mt-4 rounded-2xl bg-white/60 p-6 text-sm text-slate-500">No tienes borradores de sesión pendientes.</p>
      : <>
        <p className="mt-4 text-sm text-teal-900" role="status">{data.total} {data.total === 1 ? 'nota pendiente' : 'notas pendientes'}.{data.total > data.notas.length ? ` Se muestran las ${data.notas.length} sesiones más antiguas.` : ''}</p>
        <ul className="mt-4 divide-y divide-slate-100 rounded-2xl bg-white/60 px-5">
          {data.notas.map(note => <li key={note.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-slate-800">{note.nombre_completo}{note.paciente_status === 'archived' && <span className="ml-2 text-xs font-normal text-slate-500">Paciente archivado</span>}</p>
              <p className="mt-1 text-xs text-slate-500">Sesión del <time dateTime={note.fecha_hora}>{new Date(note.fecha_hora).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</time>{note.estado_sesion === 'Cancelada' ? ' · Cita cancelada' : ''}</p>
              <p className="mt-1 text-xs text-slate-500">Último guardado: <time dateTime={note.actualizado_en}>{new Date(note.actualizado_en).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</time></p>
            </div>
            <Link className="secondary text-sm" aria-label={'Retomar nota de ' + note.nombre_completo} href={'/pacientes?' + new URLSearchParams({ paciente: note.paciente_id, sesion: note.sesion_id })}>Retomar nota</Link>
          </li>)}
        </ul>
      </>}
  </section>;
}
