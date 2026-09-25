"use client";
import { useEffect, useState } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { topics, formats, tones, type Resource, type Template } from '@/lib/marketing-shared';

type Profile = { nombre: string; email: string; especialidad: string; tono: string; enlace_consulta: string; rol: string };
type Patient = { id: string; nombre_completo: string; email: string | null; telefono: string | null; consentimiento_marketing: number | null; estado: string };
type Draft = { gancho: string; desarrollo: string; ejercicio: string; cta: string; hashtags: string; aviso: string };
const tabs = ['Perfil Profesional', 'Contenido Social', 'Plantillas y Secuencias', 'Captación'];
async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(path, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  if (response.status === 401) { redirect('/acceso'); }
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'No se pudo completar la operación.');
  return value;
}
export function MarketingSuite() {
  const [tab, setTab] = useState(tabs[0]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const [p, t, r, people] = await Promise.all([api<Profile>('/api/perfil'), api<Template[]>('/api/marketing/plantillas'), api<Resource[]>('/api/marketing/recursos'), api<Patient[]>('/api/pacientes')]);
        if (active) { setProfile(p); setTemplates(t); setResources(r); setPatients(people); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Error de carga.'); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [reload]);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  }
  async function copy(text: string) {
    await perform(async () => { await navigator.clipboard.writeText(text); setNotice('Copiado al portapapeles.'); });
  }
  return <>
    <div className="mb-7 rounded-2xl bg-blue-50 p-6"><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Comunicación con propósito</p><h2 className="mt-2 text-xl font-semibold text-slate-800">Haz crecer tu consulta a tu ritmo</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Tu identidad profesional, tus contenidos y las primeras conversaciones con futuros pacientes.</p></div>
    <nav aria-label="Herramientas de marketing" className="mb-6 flex flex-wrap gap-2">{tabs.map(t => <button key={t} disabled={busy} aria-pressed={t === tab} className={t === tab ? 'action' : 'secondary'} onClick={() => { setTab(t); setNotice(''); setError(''); }}>{t}</button>)}</nav>
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} {!profile && <button className="ml-3 underline" onClick={() => setReload(v => v + 1)}>Reintentar</button>}</div>}
    {notice && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">{notice}</p>}
    {loading ? <p role="status">Cargando tu espacio…</p> : profile && <>
      {tab === tabs[0] && <form className="panel max-w-3xl" onSubmit={e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); void perform(async () => { setProfile(await api<Profile>('/api/perfil', 'PUT', values)); setNotice('Perfil profesional guardado.'); }); }}><h2 className="text-xl font-semibold">Perfil Profesional</h2><p className="mt-2 text-sm text-slate-500">{profile.email} · Rol: {profile.rol}</p><fieldset disabled={busy} className="mt-6 grid gap-5 sm:grid-cols-2"><label className="text-sm sm:col-span-2">Nombre profesional<input className="field" name="nombre" required maxLength={200} defaultValue={profile.nombre} /></label><label className="text-sm sm:col-span-2">Especialidad<input className="field" name="especialidad" maxLength={500} defaultValue={profile.especialidad} placeholder="Terapia Cognitivo-Conductual, Ansiedad, Parejas…" /></label><label className="text-sm">Tono habitual<select className="field" name="tono" defaultValue={profile.tono}>{tones.map(t => <option key={t}>{t}</option>)}</select></label><label className="text-sm">Enlace para agendar consulta<input className="field" type="url" name="enlace_consulta" maxLength={1000} placeholder="https://…" defaultValue={profile.enlace_consulta} /></label><div className="sm:col-span-2"><button className="action" type="submit">{busy ? 'Guardando…' : 'Guardar perfil'}</button></div></fieldset></form>}
      {tab === tabs[1] && <ContentStudio tone={profile.tono} busy={busy} perform={perform} copy={copy} />}
      {tab === tabs[2] && <TemplateStudio profile={profile} patients={patients} templates={templates} busy={busy} perform={perform} copy={copy} saved={t => { setTemplates(list => list.map(x => x.id === t.id ? t : x)); setNotice('Plantilla guardada.'); }} />}
      {tab === tabs[3] && <LeadStudio resources={resources} busy={busy} perform={perform} copy={copy} saved={async () => { setResources(await api<Resource[]>('/api/marketing/recursos')); setNotice('Recurso guardado.'); }} />}
    </>}
  </>;
}
type Actions = { busy: boolean; perform: (action: () => Promise<void>) => Promise<void>; copy: (text: string) => Promise<void> };
function ContentStudio({ tone, busy, perform, copy }: Actions & { tone: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const labels = { gancho: 'Gancho visual / Encabezado', desarrollo: 'Desarrollo', ejercicio: 'Ejercicio o reflexión', cta: 'Llamada a la acción', hashtags: 'Hashtags sugeridos' };
  return <div className="grid gap-6 xl:grid-cols-[320px_1fr]"><form className="panel self-start" onSubmit={e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); void perform(async () => { setDraft(await api<Draft>('/api/marketing/contenido', 'POST', values)); }); }}><h2 className="text-lg font-semibold">Crea un borrador</h2><fieldset disabled={busy} className="mt-5 space-y-5"><label className="block text-sm">Tema clínico<select name="tema" className="field">{topics.map(t => <option key={t}>{t}</option>)}</select></label><label className="block text-sm">Formato objetivo<select name="formato" className="field">{formats.map(f => <option key={f}>{f}</option>)}</select></label><label className="block text-sm">Tono de voz<select name="tono" defaultValue={tone} className="field">{tones.map(t => <option key={t}>{t}</option>)}</select></label><button className="action w-full">{busy ? 'Preparando…' : 'Generar contenido'}</button></fieldset><p className="mt-4 text-xs leading-5 text-slate-500">Generación editorial local. Revisa el contenido antes de publicarlo. No utiliza información de pacientes.</p></form><section className="panel"><div className="mb-5 flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">Tu contenido</h2>{draft && <button className="secondary" disabled={busy} onClick={() => void copy(Object.entries(labels).map(([key, label]) => `${label}\n${draft[key as keyof typeof labels]}`).join('\n\n'))}>Copiar al portapapeles</button>}</div>{draft ? <div className="space-y-5">{Object.entries(labels).map(([key, label]) => <label key={key} className="block text-sm font-semibold text-blue-900">{label}<textarea className="field font-normal" rows={key === 'desarrollo' ? 9 : 3} value={draft[key as keyof typeof labels]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}<p className="text-xs text-slate-500">{draft.aviso}</p></div> : <p className="py-16 text-center text-sm text-slate-500">Selecciona tema, formato y tono para comenzar.</p>}</section></div>;
}
function TemplateStudio({ profile, patients, templates, busy, perform, copy, saved }: Actions & { profile: Profile; patients: Patient[]; templates: Template[]; saved: (t: Template) => void }) {
  const [selected, setSelected] = useState(templates[0]?.id || '');
  const template = templates.find(t => t.id === selected);
  return <div><p className="mb-5 text-sm text-slate-500">Las secuencias muestran el orden y la espera sugerida. Tú eliges cuándo contactar; no se programan envíos automáticos.</p><label className="mb-5 block max-w-xl text-sm">Plantilla o paso de secuencia<select className="field" value={selected} disabled={busy} onChange={e => setSelected(e.target.value)}>{templates.map(t => <option key={t.id} value={t.id}>{t.nombre} · Paso {t.paso} · {t.dias_espera} días</option>)}</select></label>{template && <TemplateEditor key={template.id} template={template} profile={profile} patients={patients} busy={busy} perform={perform} copy={copy} saved={saved} />}</div>;
}
function TemplateEditor({ template, profile, patients, busy, perform, copy, saved }: Actions & { template: Template; profile: Profile; patients: Patient[]; saved: (t: Template) => void }) {
  const [content, setContent] = useState(template.contenido);
  const [subject, setSubject] = useState(template.asunto);
  const [patientId, setPatientId] = useState('');
  const [date, setDate] = useState('');
  const [phone, setPhone] = useState('');
  const [onlyInactive, setOnlyInactive] = useState(template.categoria === 'reactivacion');
  const patient = patients.find(p => p.id === patientId);
  const variables: Record<string, string> = { nombre_paciente: patient?.nombre_completo || '{{nombre_paciente}}', fecha_hora: date ? new Date(date).toLocaleString('es-CL') : '{{fecha_hora}}', nombre_profesional: profile.nombre, enlace_consulta: profile.enlace_consulta || 'responde a este mensaje para consultar disponibilidad' };
  const render = (value: string) => value.replace(/\{\{\s*(\w+)\s*\}\}/g, (full, key) => variables[key] || full);
  const preview = render(content);
  const unresolved = /\{\{.*?\}\}/.test(preview + render(subject));
  const normalizedPhone = phone.replace(/[\s()-]/g, '');
  const validPhone = /^\+[1-9]\d{7,14}$/.test(normalizedPhone);
  return <div className="grid gap-6 xl:grid-cols-2"><form className="panel" onSubmit={e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); void perform(async () => saved(await api<Template>('/api/marketing/plantillas', 'PUT', { ...values, id: template.id, dias_espera: Number(values.dias_espera) }))); }}><h2 className="text-lg font-semibold">Editar plantilla</h2><fieldset className="mt-5 space-y-4" disabled={busy}><label className="block text-sm">Nombre<input name="nombre" className="field" required maxLength={200} defaultValue={template.nombre} /></label><label className="block text-sm">Espera sugerida (días)<input name="dias_espera" type="number" min={0} max={365} required defaultValue={template.dias_espera} className="field" /></label><label className="block text-sm">Asunto de email<input name="asunto" className="field" required maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} /></label><label className="block text-sm">Mensaje<textarea name="contenido" className="field" rows={8} required maxLength={10000} value={content} onChange={e => setContent(e.target.value)} /></label><p className="text-xs leading-5 text-slate-500">Variables: {'{{nombre_paciente}}, {{fecha_hora}}, {{nombre_profesional}}, {{enlace_consulta}}'}</p><button className="action">Guardar plantilla</button></fieldset></form><section className="panel"><h2 className="text-lg font-semibold">Preparar comunicación</h2><label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={onlyInactive} onChange={e => { setOnlyInactive(e.target.checked); setPatientId(''); setPhone(''); }} />Solo pacientes inactivos</label><label className="mt-4 block text-sm">Paciente<select className="field" value={patientId} onChange={e => { setPatientId(e.target.value); setPhone(patients.find(p => p.id === e.target.value)?.telefono || ''); }}><option value="">Selecciona un paciente</option>{patients.filter(p => !onlyInactive || p.estado === 'Inactivo').map(p => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}</select></label>{patient && <p className="mt-3 text-xs text-slate-500">Consentimiento para comunicaciones: {patient.consentimiento_marketing === 1 ? "autorizado en el formulario" : patient.consentimiento_marketing === 0 ? "no autorizado en el formulario" : "sin registro en captación"}.</p>}<label className="mt-4 block text-sm">Fecha y hora de la sesión<input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} className="field" /></label><label className="mt-4 block text-sm">WhatsApp con código de país<input type="tel" placeholder="+56912345678" className="field" value={phone} onChange={e => setPhone(e.target.value)} /></label><div className="my-5 rounded-xl bg-blue-50 p-4"><p className="mb-2 text-xs font-semibold text-blue-700">VISTA PREVIA</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{preview}</p></div>{unresolved && <p className="mb-4 text-xs text-amber-800">Completa las variables antes de abrir el mensaje.</p>}<div className="flex flex-wrap gap-3"><button className="secondary" disabled={busy || unresolved} onClick={() => void copy(preview)}>Copiar mensaje</button><button className="action" disabled={!patient || unresolved || !validPhone} onClick={() => window.open(`https://web.whatsapp.com/send?phone=${normalizedPhone.slice(1)}&text=${encodeURIComponent(preview)}`, '_blank', 'noopener,noreferrer')}>Enviar por WhatsApp Web</button><button className="secondary" disabled={!patient?.email || unresolved} onClick={() => { window.location.href = `mailto:${encodeURIComponent(patient!.email!)}?subject=${encodeURIComponent(render(subject))}&body=${encodeURIComponent(preview)}`; }}>Abrir email</button></div><p className="mt-4 text-xs text-slate-500">Al abrir WhatsApp se comparte el mensaje con ese servicio. Revisa destinatario y contenido antes de enviarlo.</p></section></div>;
}
function LeadStudio({ resources, busy, perform, copy, saved }: Actions & { resources: Resource[]; saved: () => Promise<void> }) {
  const [selected, setSelected] = useState('new');
  const resource = resources.find(r => r.id === selected);
  return <div className="grid gap-6 xl:grid-cols-[280px_1fr]"><aside className="panel self-start"><h2 className="text-lg font-semibold">Tus recursos</h2><button className="action my-4 w-full" disabled={busy} onClick={() => setSelected('new')}>Nuevo recurso</button><div className="space-y-3">{resources.map(r => <button key={r.id} disabled={busy} aria-pressed={selected === r.id} className={`w-full rounded-xl border p-3 text-left ${selected === r.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`} onClick={() => setSelected(r.id)}><span className="block text-sm font-medium">{r.titulo}</span><span className="mt-1 block text-xs text-slate-500">{r.publicado ? 'Publicado' : 'Borrador'} · {r.captaciones || 0} solicitudes</span></button>)}{!resources.length && <p className="text-sm text-slate-500">Crea tu primera guía o ejercicio de autoevaluación.</p>}</div></aside><ResourceEditor key={selected} resource={resource} busy={busy} perform={perform} copy={copy} saved={async id => { await saved(); setSelected(id); }} /></div>;
}
function ResourceEditor({ resource, busy, perform, copy, saved }: Actions & { resource?: Resource; saved: (id: string) => Promise<void> }) {
  const [type, setType] = useState(resource?.tipo || 'guia');
  return <form className="panel" onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); void perform(async () => {
    const result = await api<Resource>('/api/marketing/recursos', resource ? 'PUT' : 'POST', { id: resource?.id, titulo: values.get('titulo'), descripcion: values.get('descripcion'), tipo: type, contenido: values.get('contenido'), publicado: values.get('publicado') === 'on', preguntas: type === 'test' ? String(values.get('preguntas')).split('\n').map(x => x.trim()).filter(Boolean) : [] });
    await saved(result.id);
  }); }}><h2 className="text-xl font-semibold">{resource ? 'Editar recurso de captación' : 'Crear recurso de captación'}</h2><fieldset disabled={busy} className="mt-5 space-y-4"><label className="block text-sm">Título<input className="field" name="titulo" required maxLength={200} defaultValue={resource?.titulo || ''} placeholder="Guía de reflexión sobre el estrés" /></label><label className="block text-sm">Tipo<select className="field" value={type} onChange={e => setType(e.target.value as 'guia' | 'test')}><option value="guia">Guía descargable</option><option value="test">Test de autoevaluación reflexiva</option></select></label><label className="block text-sm">Descripción pública<textarea className="field" rows={3} required maxLength={2000} name="descripcion" defaultValue={resource?.descripcion || ''} /></label>{type === 'test' && <label className="block text-sm">Preguntas (una por línea, máximo 12)<textarea className="field" rows={5} required maxLength={3600} name="preguntas" defaultValue={resource?.preguntas.join('\n') || '¿Con qué frecuencia has sentido que necesitas una pausa?\n¿Con qué frecuencia has tenido dificultad para desconectar de tus tareas?\n¿Con qué frecuencia has deseado contar con más apoyo?'} /><span className="text-xs text-slate-500">Respuestas: Nunca, A veces, A menudo, Casi siempre. Sin umbrales ni interpretación diagnóstica.</span></label>}<label className="block text-sm">{type === 'test' ? 'Reflexión que recibirá la persona' : 'Contenido de la guía descargable (.txt)'}<textarea className="field" rows={10} required maxLength={30000} name="contenido" defaultValue={resource?.contenido || 'Una pausa para reflexionar\n\n¿Qué situación te gustaría comprender mejor?\n¿Qué apoyo necesitas en este momento?\n¿Qué pregunta te gustaría llevar a una consulta?\n\nEste material es una invitación a reflexionar, no una evaluación clínica.'} /></label><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="publicado" defaultChecked={resource?.publicado || false} />Publicar formulario y permitir nuevas solicitudes</label><button className="action">{busy ? 'Guardando…' : 'Guardar recurso'}</button></fieldset>{resource?.publicado && <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-5"><Link className="secondary" target="_blank" href={`/captacion/${resource.id}`}>Ver formulario público</Link><button type="button" className="secondary" disabled={busy} onClick={() => void copy(`${window.location.origin}/captacion/${resource.id}`)}>Copiar enlace público</button></div>}<p className="mt-4 text-xs leading-5 text-slate-500">Las solicitudes autorizadas se registran en tu CRM. El formulario identifica al profesional responsable y solicita consentimiento. Las respuestas del test no se almacenan.</p></form>;
}


