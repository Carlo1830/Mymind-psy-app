"use client";
import { useEffect, useState } from 'react';
type PublicResource = { id: string; titulo: string; descripcion: string; tipo: string; preguntas: string[]; profesional: string; consentimiento: string };
type Result = { titulo: string; contenido: string; mensaje: string; aviso: string };
export function PublicCapture({ id }: { id: string }) {
  const [resource, setResource] = useState<PublicResource | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try { const response = await fetch(`/api/publico/${id}`, { cache: 'no-store', signal: controller.signal }); const value = await response.json(); if (!response.ok) throw new Error(value.error); setResource(value); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo cargar el recurso.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [id]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!resource) return;
    const values = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/publico/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre_completo: values.get('nombre_completo'), email: values.get('email'), consentimiento: values.get('consentimiento') === 'on', marketing: values.get('marketing') === 'on', website: values.get('website'), respuestas: resource.preguntas.map((_, i) => Number(values.get(`respuesta-${i}`))) }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error); setResult(value);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar tu solicitud.'); }
    finally { setBusy(false); }
  }
  function download() {
    if (!result) return;
    const blob = new Blob([result.titulo + '\n\n' + result.contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'recurso-mymind.txt'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="mx-auto max-w-2xl"><p className="mb-6 text-sm font-semibold text-blue-700">Mymind · Recursos para tu bienestar</p>{loading && <p role="status">Cargando recurso…</p>}{error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}{resource && <section className="panel"><p className="text-sm text-blue-700">Un recurso de {resource.profesional}</p><h1 className="mt-3 text-3xl font-semibold">{resource.titulo}</h1><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{resource.descripcion}</p>{result ? <div className="mt-6"><p role="status" className="text-sm text-blue-800">{result.mensaje}</p><div className="my-5 whitespace-pre-wrap rounded-xl bg-blue-50 p-5 text-sm leading-7">{result.contenido}</div>{result.aviso && <p className="mb-4 text-sm text-slate-600">{result.aviso}</p>}<button className="action" onClick={download}>Descargar recurso (.txt)</button></div> : <form onSubmit={submit} className="mt-6"><fieldset disabled={busy} className="space-y-5">{resource.tipo === 'test' && <><p className="rounded-xl bg-blue-50 p-4 text-sm leading-6">Ejercicio de reflexión sin puntuación clínica. No diagnostica ansiedad ni estrés. Las respuestas no se almacenan.</p>{resource.preguntas.map((q, i) => <label className="block text-sm" key={i}>{i + 1}. {q}<select name={`respuesta-${i}`} required className="field" defaultValue=""><option value="" disabled>Selecciona una respuesta</option>{['Nunca', 'A veces', 'A menudo', 'Casi siempre'].map((a, j) => <option value={j} key={a}>{a}</option>)}</select></label>)}</>}<label className="block text-sm">Nombre<input name="nombre_completo" className="field" autoComplete="name" required maxLength={200} /></label><label className="block text-sm">Correo electrónico<input name="email" className="field" type="email" autoComplete="email" required maxLength={254} /></label><div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div><p className="text-xs leading-5 text-slate-500">Responsable de esta solicitud: {resource.profesional}. Se guardarán nombre, correo, fuente de captación y consentimiento en su consulta. Puedes solicitar al profesional el acceso o la eliminación de tus datos.</p><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" required name="consentimiento" className="mt-1.5" />{resource.consentimiento}</label><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name="marketing" className="mt-1.5" />También deseo recibir comunicaciones de este profesional. (Opcional)</label><button type="submit" className="action">{busy ? 'Registrando…' : 'Recibir recurso'}</button></fieldset></form>}</section>}</div>;
}
