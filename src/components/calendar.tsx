"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Sesion } from '@/types/database';

type Appointment = Omit<Sesion, 'notas_evolucion'> & { nombre_completo: string };
type PatientOption = { id: string; nombre_completo: string };
const states = ['Programada', 'Realizada', 'Cancelada'] as const;
const colors = { Programada: 'border-blue-200 bg-blue-50 text-blue-900', Realizada: 'border-teal-200 bg-teal-50 text-teal-900', Cancelada: 'border-slate-200 bg-slate-100 text-slate-600' };
const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600';
const button = 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50';
const primary = 'rounded-xl bg-teal-800 px-4 py-2.5 shadow-sm text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50';
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const timeLabel = (date: Date) => date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
function addDays(date: Date, days: number) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days); }
function weekStart(date: Date) { return addDays(date, -((date.getDay() + 6) % 7)); }
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'No se pudo completar la operación.');
  return value;
}

const subscribe = () => () => {};
export function Calendar() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <CalendarContent /> : <p role="status">Cargando calendario…</p>;
}

function CalendarContent() {
  const [anchor, setAnchor] = useState<Date | null>(() => new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [error, setError] = useState('');
  const [patientsError, setPatientsError] = useState('');
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [formDate, setFormDate] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);


  const range = useMemo(() => {
    if (!anchor) return null;
    const start = view === 'month' ? weekStart(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : weekStart(anchor);
    const end = view === 'month' ? addDays(weekStart(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)), 7) : addDays(start, 7);
    const days: Date[] = [];
    for (let day = start; day < end; day = addDays(day, 1)) days.push(day);
    return { start, end, days };
  }, [anchor, view]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadPatients() {
      setPatientsLoading(true); setPatientsError('');
      try { setPatients(await api<PatientOption[]>('/api/pacientes', { signal: controller.signal })); }
      catch (e) { if (!controller.signal.aborted) setPatientsError(e instanceof Error ? e.message : 'No se pudieron cargar los pacientes.'); }
      finally { if (!controller.signal.aborted) setPatientsLoading(false); }
    }
    void loadPatients();
    return () => controller.abort();
  }, [version]);

  useEffect(() => {
    if (!range) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ desde: range.start.toISOString(), hasta: range.end.toISOString() });
    async function load() {
      setLoading(true); setError('');
      try { setAppointments(await api<Appointment[]>(`/api/sesiones?${params}`, { signal: controller.signal })); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo cargar la agenda.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [range, version]);

  function open(record: Appointment | null, date?: Date) {
    setEditing(record); setFormDate(dateKey(record ? new Date(record.fecha_hora) : date || new Date()));
    setFormError(''); setFormOpen(true); dialog.current?.showModal();
  }
  function navigate(direction: number) {
    if (!anchor) return;
    setAnchor(view === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1) : addDays(anchor, direction * 7));
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = new FormData(event.currentTarget);
    const local = `${values.get('fecha')}T${values.get('hora')}`;
    const date = new Date(local);
    setFormError('');
    if (!Number.isFinite(date.getTime()) || `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` !== local) {
      setFormError('La fecha u hora no es válida en la zona horaria de este dispositivo.'); return;
    }
    setSaving(true);
    try {
      const record = await api<Appointment>(editing ? `/api/sesiones/${editing.id}` : '/api/sesiones', {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paciente_id: editing?.paciente_id || values.get('paciente_id'), fecha_hora: date.toISOString(), duracion_minutos: Number(values.get('duracion_minutos')), estado_sesion: values.get('estado_sesion'), modalidad: values.get('modalidad') }),
      });
      dialog.current?.close(); setFormOpen(false); setAnchor(new Date(record.fecha_hora)); setVersion(v => v + 1);
      setNotice(editing ? 'Cita actualizada.' : 'Cita agendada.');
    } catch (e) { setFormError(e instanceof Error ? e.message : 'No se pudo guardar la cita.'); }
    finally { setSaving(false); }
  }

  const title = anchor && range ? view === 'month' ? anchor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }) : `${range.start.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} al ${addDays(range.end, -1).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Calendario';
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Fechas y horas en la zona horaria de este dispositivo.</p><button className={primary} onClick={() => open(null)}>Agendar nueva cita</button></div>
    {notice && <p role="status" className="mb-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
    <section aria-label="Agenda de citas" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5"><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold capitalize" aria-live="polite">{title}</h2><button className={button} aria-label="Periodo anterior" onClick={() => navigate(-1)}>Anterior</button><button className={button} onClick={() => setAnchor(new Date())}>Hoy</button><button className={button} aria-label="Periodo siguiente" onClick={() => navigate(1)}>Siguiente</button></div><div className="flex gap-2" aria-label="Vista del calendario"><button className={view === 'month' ? primary : button} aria-pressed={view === 'month'} onClick={() => setView('month')}>Mes</button><button className={view === 'week' ? primary : button} aria-pressed={view === 'week'} onClick={() => setView('week')}>Semana</button></div></div>
      <div className="flex flex-wrap gap-3 px-5 py-3" aria-label="Leyenda de estados">{states.map(state => <span key={state} className={`rounded-full border px-3 py-1 text-xs ${colors[state]}`}>{state}</span>)}</div>
      {loading ? <p role="status" className="p-12 text-center text-slate-500">Cargando agenda…</p> : error ? <div role="alert" className="p-6 text-red-700">{error} <button className={button} onClick={() => setVersion(v => v + 1)}>Reintentar</button></div> : range && <>
        <div className="overflow-x-auto"><div className="min-w-[840px]" role="group" aria-label={view === 'month' ? 'Calendario mensual' : 'Calendario semanal'}><div className="grid grid-cols-7 border-y border-slate-200 bg-slate-50">{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => <div key={day} className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{day}</div>)}</div><div className="grid grid-cols-7">{range.days.map(day => {
          const key = dateKey(day);
          const daily = appointments.filter(a => dateKey(new Date(a.fecha_hora)) === key);
          const today = key === dateKey(new Date());
          return <section key={key} aria-label={day.toLocaleDateString('es-CL', { dateStyle: 'full' })} className={`min-w-0 border-r border-b border-slate-100 p-2 ${view === 'week' ? 'min-h-80' : 'min-h-36'} ${view === 'month' && day.getMonth() !== anchor?.getMonth() ? 'bg-slate-50' : 'bg-white'}`}><button className={`mb-2 rounded-lg px-2 py-1 text-sm font-semibold hover:ring-2 hover:ring-teal-300 ${today ? 'bg-teal-800 text-white' : 'text-slate-600'}`} aria-label={`Agendar cita el ${day.toLocaleDateString('es-CL')}`} onClick={() => open(null, day)}>{view === 'week' ? day.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : day.getDate()}</button><div className="space-y-2">{daily.map(a => <button key={a.id} onClick={() => open(a)} className={`block w-full rounded-lg border p-2 text-left text-xs hover:ring-2 hover:ring-teal-400 ${colors[a.estado_sesion]}`}><span className="block font-semibold">{timeLabel(new Date(a.fecha_hora))} · {a.duracion_minutos} min</span><span className="mt-1 block break-words font-medium">{a.nombre_completo}</span><span className="mt-1 block">{a.estado_sesion}</span>{view === 'week' && <span className="mt-1 block">{a.modalidad} · Hasta {timeLabel(new Date(Date.parse(a.fecha_hora) + a.duracion_minutos * 60000))}</span>}</button>)}{view === 'week' && !daily.length && <p className="px-2 text-xs text-slate-400">Sin citas</p>}</div></section>;
        })}</div></div></div>
        <p className="p-4 text-xs text-slate-500">{appointments.length ? `${appointments.length} citas en el periodo visible.` : 'No hay citas en este periodo. Selecciona un día para agendar.'} En pantallas pequeñas puedes desplazar el calendario horizontalmente.</p>
      </>}
    </section>
    <dialog ref={dialog} aria-labelledby="appointment-title" onCancel={e => { if (saving) e.preventDefault(); }} onClose={() => setFormOpen(false)} className="fixed inset-0 m-auto max-h-[90vh] w-[min(95vw,620px)] overflow-y-auto rounded-2xl border-0 p-6 shadow-xl backdrop:bg-slate-900/40">
      {formOpen && <form key={`${editing?.id || 'new'}-${formDate}`} onSubmit={save}><div className="mb-5 flex items-center justify-between gap-3"><h2 id="appointment-title" className="text-xl font-semibold">{editing ? 'Detalle y edición de cita' : 'Agendar nueva cita'}</h2><button type="button" disabled={saving} className={button} onClick={() => dialog.current?.close()}>Cerrar</button></div>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Paciente{editing ? <input readOnly className={input} value={editing.nombre_completo} /> : <select autoFocus name="paciente_id" required className={input} disabled={patientsLoading || !!patientsError} defaultValue=""><option value="">{patientsLoading ? 'Cargando pacientes…' : 'Selecciona un paciente'}</option>{patients.map(p => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}</select>}</label>
          {!editing && patientsError && <div role="alert" className="text-sm text-red-700 sm:col-span-2">{patientsError} <button type="button" className={button} onClick={() => setVersion(v => v + 1)}>Reintentar</button></div>}
          {!editing && !patientsLoading && !patientsError && patients.length === 0 && <p className="text-sm sm:col-span-2">No hay pacientes registrados. <Link className="text-teal-800 underline" href="/pacientes">Crear un paciente</Link></p>}
          <label className="text-sm font-medium">Fecha<input name="fecha" type="date" required defaultValue={formDate} className={input} /></label>
          <label className="text-sm font-medium">Hora de inicio<input name="hora" type="time" required defaultValue={editing ? `${String(new Date(editing.fecha_hora).getHours()).padStart(2, '0')}:${String(new Date(editing.fecha_hora).getMinutes()).padStart(2, '0')}` : '09:00'} className={input} /></label>
          <label className="text-sm font-medium">Duración (minutos)<input name="duracion_minutos" type="number" required min={5} max={480} step={1} defaultValue={editing?.duracion_minutos || 50} className={input} /></label>
          <label className="text-sm font-medium">Estado de la cita<select name="estado_sesion" defaultValue={editing?.estado_sesion || 'Programada'} className={input}>{states.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="text-sm font-medium sm:col-span-2">Modalidad<select name="modalidad" defaultValue={editing?.modalidad || 'Presencial'} className={input}><option>Presencial</option><option>Online</option></select></label>
          {formError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-3 sm:col-span-2"><button type="button" className={button} onClick={() => dialog.current?.close()}>Cancelar</button><button type="submit" disabled={!editing && (patientsLoading || !!patientsError || !patients.length)} className={primary}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agendar cita'}</button></div>
        </fieldset>
        {editing && !saving && <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-5"><Link className="text-sm font-medium text-teal-800 underline" href={`/pacientes?paciente=${encodeURIComponent(editing.paciente_id)}#ficha-paciente`}>Ir a Ficha del Paciente</Link><Link className="text-sm font-medium text-teal-800 underline" href={`/pacientes?paciente=${encodeURIComponent(editing.paciente_id)}&sesion=${encodeURIComponent(editing.id)}#nota-evolucion`}>Agregar Nota de Evolución</Link><p className="text-xs text-slate-500">Guarda los cambios de la cita antes de abrir la ficha.</p></div>}
      </form>}
    </dialog>
  </>;
}


