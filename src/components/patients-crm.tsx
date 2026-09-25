"use client";

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Paciente, Sesion, EstadoPaciente, StatusPaciente } from '@/types/database';

const states: EstadoPaciente[] = ['Nuevo contacto', 'En evaluación', 'Tratamiento activo', 'Inactivo'];
type Summary = Pick<Paciente, 'id' | 'nombre_completo' | 'email' | 'telefono' | 'estado' | 'status' | 'fecha_registro'>;
type Detail = { paciente: Paciente; sesiones: Sesion[] };
const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
const primary = 'rounded-xl bg-teal-800 px-4 py-2.5 shadow-sm text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50';
const secondary = 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50';
const dateLabel = (value: string) => new Date(value).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
function localNow() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data as T;
}
function Badge({ state }: { state: EstadoPaciente }) {
  const colors = { 'Nuevo contacto': 'bg-blue-50 text-blue-800', 'En evaluación': 'bg-amber-50 text-amber-800', 'Tratamiento activo': 'bg-teal-50 text-teal-800', Inactivo: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${colors[state]}`}>{state}</span>;
}

export function PatientsCRM() {
  const searchParams = useSearchParams();
  const linkedPatient = searchParams.get('paciente');
  const linkedSession = searchParams.get('sesion');
  return <PatientsContent key={linkedPatient + ':' + linkedSession} linkedPatient={linkedPatient} linkedSession={linkedSession} />;
}

function PatientsContent({ linkedPatient, linkedSession }: { linkedPatient: string | null; linkedSession: string | null }) {
  const [patients, setPatients] = useState<Summary[]>([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [status, setStatus] = useState<StatusPaciente>('active');
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState('');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [selected, setSelected] = useState<string | null>(linkedPatient);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailVersion, setDetailVersion] = useState(0);
  const [editing, setEditing] = useState<Paciente | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [noteError, setNoteError] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);



  useEffect(() => {
    if (detail && detail.paciente.id === linkedPatient) {
      document.getElementById(linkedSession ? 'nota-evolucion' : 'ficha-paciente')?.scrollIntoView({ block: 'start' });
    }
  }, [detail, linkedPatient, linkedSession]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try { const rows = await api<Summary[]>(`/api/pacientes?${new URLSearchParams({ q: query, estado: state, status })}`, { signal: controller.signal }); setPatients(rows); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Error al cargar pacientes.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, state, status, version]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    async function load() {
      setDetailLoading(true); setDetailError(''); setDetail(null); setNoteError('');
      try { setDetail(await api<Detail>(`/api/pacientes/${selected}`, { signal: controller.signal })); }
      catch (e) { if (!controller.signal.aborted) setDetailError(e instanceof Error ? e.message : 'Error al cargar la ficha.'); }
      finally { if (!controller.signal.aborted) setDetailLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [selected, detailVersion]);

  const openForm = useCallback((record: Paciente | null) => {
    setEditing(record); setFormError(''); setFormOpen(true); dialog.current?.showModal();
  }, []);

  async function savePatient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true); setFormError('');
    try {
      const record = await api<Paciente>(editing ? `/api/pacientes/${editing.id}` : '/api/pacientes', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      dialog.current?.close(); setFormOpen(false); setVersion(v => v + 1); setSelected(record.id); setDetailVersion(v => v + 1); setNotice(editing ? 'Paciente actualizado.' : 'Paciente creado.');
    } catch (e) { setFormError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  }

  async function changeStatus(record: Summary) {
    if (archiving) return;
    const next: StatusPaciente = record.status === 'archived' ? 'active' : 'archived';
    setArchiving(record.id); setArchiveError(''); setNotice('');
    try {
      await api('/api/pacientes/' + record.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
      setPatients(rows => rows.filter(p => p.id !== record.id));
      setVersion(v => v + 1);
      if (selected === record.id) setDetailVersion(v => v + 1);
      setNotice(next === 'archived' ? 'Paciente archivado. Su ficha y sesiones se conservan.' : 'Paciente restaurado. Ya aparece entre los pacientes activos.');
    } catch (e) { setArchiveError(e instanceof Error ? e.message : 'No se pudo actualizar el paciente.'); }
    finally { setArchiving(null); }
  }

  function archiveButton(record: Summary) {
    const label = record.status === 'archived' ? 'Restaurar' : 'Archivar';
    return <button type="button" className={secondary} disabled={archiving !== null} onClick={() => void changeStatus(record)} aria-label={label + ' a ' + record.nombre_completo}>{archiving === record.id ? 'Guardando…' : label}</button>;
  }

  async function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || noteSaving) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setNoteSaving(true); setNoteError('');
    try {
      const date = new Date(String(values.fecha_hora));
      if (!Number.isFinite(date.getTime())) throw new Error('Indica una fecha y hora válida.');
      await api(`/api/pacientes/${selected}/sesiones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, fecha_hora: date.toISOString() }) });
      form.reset(); setDetailVersion(v => v + 1); setNotice('Nota de evolución guardada.');
    } catch (e) { setNoteError(e instanceof Error ? e.message : 'No se pudo guardar la nota.'); }
    finally { setNoteSaving(false); }
  }

  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-slate-500">Gestiona tus contactos y el seguimiento clínico.</p><button className={primary} onClick={() => openForm(null)}>Nuevo paciente</button></div>
    {notice && <p role="status" className="mb-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
    {archiveError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{archiveError}</p>}
    <section aria-label="Listado de pacientes" className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5">
      <div role="group" aria-label="Estado de archivo" className="mb-5 flex flex-wrap gap-2">{(['active', 'archived'] as const).map(value => <button key={value} type="button" aria-pressed={status === value} className={status === value ? primary : secondary} onClick={() => { if (status !== value) { setStatus(value); setLoading(true); setPatients([]); setArchiveError(''); } }}>{value === 'active' ? 'Pacientes Activos' : 'Pacientes Archivados'}</button>)}</div>
      <p className="mb-4 text-xs text-slate-500">Archivar conserva la ficha y el historial; no cambia el estado clínico ni cancela citas.</p>
      <div className="mb-5 flex flex-wrap items-end gap-4"><label className="min-w-48 flex-1 text-sm font-medium">Buscar por nombre<input className={input} type="search" placeholder="Nombre del paciente" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="text-sm font-medium">Estado<select className={input} value={state} onChange={e => setState(e.target.value)}><option value="">Todos los estados</option>{states.map(s => <option key={s}>{s}</option>)}</select></label><div className="flex gap-2" aria-label="Presentación"><button aria-pressed={view === 'table'} className={view === 'table' ? primary : secondary} onClick={() => setView('table')}>Tabla</button><button aria-pressed={view === 'cards'} className={view === 'cards' ? primary : secondary} onClick={() => setView('cards')}>Tarjetas</button></div></div>
      {loading ? <p role="status" className="py-10 text-center text-slate-500">Cargando pacientes…</p> : error ? <div role="alert" className="py-6 text-red-700">{error} <button className={secondary} onClick={() => setVersion(v => v + 1)}>Reintentar</button></div> : <>
        <p className="mb-4 text-xs text-slate-500">{patients.length} pacientes encontrados</p>
        {patients.length === 0 ? <div className="py-10 text-center"><h2 className="font-semibold">No hay pacientes para mostrar</h2><p className="mt-2 text-sm text-slate-500">Crea un paciente o ajusta la búsqueda y el estado.</p></div> : view === 'table' ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Pacientes registrados</caption><thead className="border-b border-slate-200 text-slate-500"><tr>{['Nombre', 'Contacto', 'Estado clínico', 'Acciones'].map(h => <th key={h} scope="col" className="px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{patients.map(p => <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-3 py-4"><button className="text-left font-semibold text-teal-800 hover:underline" onClick={() => setSelected(p.id)}>{p.nombre_completo}</button></td><td className="px-3 py-4"><p>{p.email || 'Sin correo'}</p><p className="mt-1 text-xs text-slate-500">{p.telefono || 'Sin teléfono'}</p></td><td className="px-3 py-4"><Badge state={p.estado} /></td><td className="px-3 py-4"><button className={secondary} onClick={() => setSelected(p.id)} aria-label={`Ver ficha de ${p.nombre_completo}`}>Ver ficha</button><div className="mt-2">{archiveButton(p)}</div></td></tr>)}</tbody></table></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{patients.map(p => <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-left hover:border-teal-500 hover:bg-teal-50/30"><Badge state={p.estado} /><h2 className="mt-4 font-semibold">{p.nombre_completo}</h2><p className="mt-2 break-all text-sm text-slate-500">{p.email || 'Sin correo'}</p><p className="mt-1 text-sm text-slate-500">{p.telefono || 'Sin teléfono'}</p><div className="mt-4 flex flex-wrap gap-2"><button className={secondary} onClick={() => setSelected(p.id)} aria-label={`Ver ficha de ${p.nombre_completo}`}>Abrir ficha</button>{archiveButton(p)}</div></article>)}</div>}
      </>}
    </section>

    {selected && <section id="ficha-paciente" aria-label="Ficha del paciente" className="mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm p-6"><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">Ficha del paciente</h2><button disabled={noteSaving} className={secondary} onClick={() => { setSelected(null); setDetail(null); }}>Cerrar ficha</button></div>
      {detailLoading ? <p role="status">Cargando ficha…</p> : detailError ? <div role="alert">{detailError} <button className={secondary} onClick={() => setDetailVersion(v => v + 1)}>Reintentar</button></div> : detail && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-2xl font-semibold">{detail.paciente.nombre_completo}</h3><div className="mt-2"><Badge state={detail.paciente.estado} />{detail.paciente.status === 'archived' && <span className="ml-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">Archivado</span>}</div></div><div className="flex flex-wrap gap-2"><button className={secondary} onClick={() => openForm(detail.paciente)}>Editar paciente</button>{archiveButton(detail.paciente)}</div></div>
        <dl className="my-6 grid gap-5 text-sm sm:grid-cols-2">{[['Correo electrónico', detail.paciente.email], ['Teléfono', detail.paciente.telefono], ['Fecha de registro', dateLabel(detail.paciente.fecha_registro)], ['Fuente de captación', detail.paciente.fuente_captacion], ['Motivo de consulta', detail.paciente.motivo_consulta], ['Notas confidenciales iniciales', detail.paciente.notas_confidenciales]].map(([label, value]) => <div key={label}><dt className="font-medium text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value || 'Sin registrar'}</dd></div>)}</dl>
        <div className="grid gap-8 xl:grid-cols-2"><div><h3 className="mb-4 text-lg font-semibold">Historial de citas y sesiones</h3>{detail.sesiones.length === 0 ? <p className="text-sm text-slate-500">Aún no hay sesiones registradas.</p> : <ol className="space-y-4">{detail.sesiones.map(s => <li key={s.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><time dateTime={s.fecha_hora} className="text-sm font-semibold">{dateLabel(s.fecha_hora)}</time><span className="text-xs text-slate-500">{s.estado_sesion}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{s.notas_evolucion || 'Sin notas de evolución.'}</p></li>)}</ol>}</div>
        <form id="nota-evolucion" key={`${detail.paciente.id}-${linkedSession || "new"}`} onSubmit={saveNote} className="rounded-xl bg-slate-50 p-5"><h3 className="text-lg font-semibold">Añadir nota de evolución</h3><p className="mt-2 text-xs leading-5 text-slate-500">Elige una sesión existente o registra una sesión realizada. Las notas nuevas se añaden al historial sin reemplazar las anteriores.</p><fieldset disabled={noteSaving} className="mt-4 space-y-4"><label className="block text-sm font-medium">Sesión<select name="sesion_id" className={input} defaultValue={detail.sesiones.some(s => s.id === linkedSession) ? linkedSession! : ""}><option value="">Nueva sesión realizada</option>{detail.sesiones.map(s => <option value={s.id} key={s.id}>{dateLabel(s.fecha_hora)} · {s.estado_sesion}</option>)}</select></label><label className="block text-sm font-medium">Fecha y hora de la nota / nueva sesión<input type="datetime-local" name="fecha_hora" required defaultValue={localNow()} className={input} /><span className="mt-1 block text-xs font-normal text-slate-500">Hora local de este dispositivo.</span></label><label className="block text-sm font-medium">Nota de evolución<textarea name="notas_evolucion" required maxLength={20000} rows={5} className={input} /></label>{noteError && <p role="alert" className="text-sm text-red-700">{noteError}</p>}<button className={primary} type="submit">{noteSaving ? 'Guardando…' : 'Guardar nota'}</button></fieldset></form></div>
      </>}
    </section>}

    <dialog ref={dialog} onCancel={e => { if (saving) e.preventDefault(); }} onClose={() => setFormOpen(false)} className="fixed inset-0 m-auto max-h-[90vh] w-[min(95vw,640px)] overflow-y-auto rounded-2xl border-0 p-6 shadow-xl backdrop:bg-slate-900/40">
      {formOpen && <form key={editing?.id || 'new'} onSubmit={savePatient}><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{editing ? 'Editar paciente' : 'Nuevo paciente'}</h2><button type="button" className={secondary} disabled={saving} onClick={() => dialog.current?.close()}>Cerrar</button></div><fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Nombre completo *<input autoFocus name="nombre_completo" required maxLength={200} defaultValue={editing?.nombre_completo || ''} className={input} /></label><label className="text-sm font-medium">Correo electrónico<input type="email" name="email" maxLength={254} defaultValue={editing?.email || ''} className={input} /></label><label className="text-sm font-medium">Teléfono<input type="tel" name="telefono" maxLength={50} defaultValue={editing?.telefono || ''} className={input} /></label><label className="text-sm font-medium sm:col-span-2">Estado<select name="estado" defaultValue={editing?.estado || 'Nuevo contacto'} className={input}>{states.map(s => <option key={s}>{s}</option>)}</select></label><label className="text-sm font-medium sm:col-span-2">Motivo de consulta<textarea name="motivo_consulta" rows={3} maxLength={10000} defaultValue={editing?.motivo_consulta || ''} className={input} /></label><label className="text-sm font-medium sm:col-span-2">Notas confidenciales iniciales<textarea name="notas_confidenciales" rows={4} maxLength={20000} defaultValue={editing?.notas_confidenciales || ''} className={input} /></label>{formError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{formError}</p>}<div className="flex justify-end gap-3 sm:col-span-2"><button type="button" className={secondary} onClick={() => dialog.current?.close()}>Cancelar</button><button type="submit" className={primary}>{saving ? 'Guardando…' : 'Guardar paciente'}</button></div></fieldset></form>}
    </dialog>
  </>;
}




