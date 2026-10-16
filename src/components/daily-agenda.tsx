"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Agenda = {
  zona_horaria: string;
  hoy: { id: string; fecha_hora: string; nombre_completo: string; modalidad: string; estado_sesion: string }[];
};

export function DailyAgenda({ name }: { name: string }) {
  const [data, setData] = useState<Agenda | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/dashboard', { cache: 'no-store', signal: controller.signal });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'No se pudo cargar la agenda.');
        setData(value); setError('');
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo cargar la agenda.');
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    window.addEventListener('focus', load);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', load); };
  }, [version]);

  const scheduled = data?.hoy.filter(a => a.estado_sesion === 'Programada').length ?? 0;
  return <div className="mx-auto w-full max-w-3xl py-2 sm:py-4">
    <header className="mb-10">
      <h1 className="font-serif text-3xl text-slate-800 sm:text-4xl">Hola, {name}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-500" aria-live="polite">
        {error ? 'Tu agenda no está disponible en este momento.' : data ? scheduled === 0 ? 'Hoy no tienes citas pendientes.' : `Tienes ${scheduled} ${scheduled === 1 ? 'cita programada' : 'citas programadas'} para hoy.` : 'Consultando tu agenda de hoy…'}
      </p>
    </header>
    <section aria-labelledby="daily-agenda-title">
      <h2 id="daily-agenda-title" className="mb-6 font-serif text-2xl text-slate-700">Agenda de hoy</h2>
      {error ? <p role="alert" className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900">{error} <button className="ml-2 underline underline-offset-4" onClick={() => setVersion(v => v + 1)}>Reintentar</button></p>
        : !data ? <p role="status" className="py-8 text-sm text-slate-500">Cargando tus encuentros…</p>
        : data.hoy.length === 0 ? <p className="rounded-2xl bg-white/60 px-6 py-10 text-sm leading-relaxed text-slate-500">No hay citas agendadas para hoy. Un buen momento para la pausa.</p>
        : <ol className="ml-2 border-l border-teal-800/15">
          {data.hoy.map(a => <li key={a.id} className="relative pb-7 pl-6 last:pb-0 sm:pl-8">
            <span aria-hidden="true" className="absolute top-2 -left-[5px] size-[9px] rounded-full bg-teal-600/40 ring-4 ring-[#faf9f6]" />
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              <time dateTime={a.fecha_hora} className="pt-0.5 text-sm font-medium tabular-nums text-slate-500 sm:w-14 sm:shrink-0">{new Date(a.fecha_hora).toLocaleTimeString('es-CL', { timeZone: data.zona_horaria, hour: '2-digit', minute: '2-digit', hour12: false })}</time>
              <div className="min-w-0">
                <p className={`break-words text-base ${a.estado_sesion === 'Cancelada' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{a.nombre_completo}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span aria-hidden="true" className={`size-1.5 rounded-full ${a.modalidad === 'Online' ? 'bg-sky-400' : 'bg-teal-500'}`} />{a.modalidad}{a.estado_sesion !== 'Programada' && <span>· {a.estado_sesion}</span>}</p>
              </div>
            </div>
          </li>)}
        </ol>}
    </section>
    <nav aria-label="Accesos rápidos" className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-slate-200/70 pt-5 text-sm text-teal-800">
      <Link href="/calendario?nueva=1" className="inline-flex items-center gap-2 rounded-md py-1 hover:underline underline-offset-4"><span aria-hidden="true">+</span>Nueva Cita</Link>
      <Link href="/pacientes?nuevo=1" className="inline-flex items-center gap-2 rounded-md py-1 hover:underline underline-offset-4"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4"><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>Nuevo Paciente</Link>
    </nav>
  </div>;
}
