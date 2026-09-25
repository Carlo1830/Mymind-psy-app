"use client";
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('activacion');
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/auth/${token ? 'activate' : register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(new FormData(event.currentTarget)), token }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      router.replace('/dashboard'); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo acceder.'); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto my-12 max-w-md rounded-3xl border border-blue-100 bg-white p-8 shadow-sm"><p className="text-sm font-medium text-blue-700">Mymind · Espacio profesional</p><h1 className="mt-4 text-2xl font-semibold">{token ? 'Activa tu cuenta principal' : register ? 'Crea tu cuenta profesional' : 'Accede a tu consulta'}</h1><p className="mt-3 text-sm text-slate-500">Pacientes, agenda y comunicación en un espacio propio.</p><form onSubmit={submit} className="mt-6 space-y-4"><fieldset disabled={busy} className="space-y-4">{register && <label className="block text-sm">Nombre profesional<input name="nombre" required maxLength={200} autoComplete="name" className="field" /></label>}<label className="block text-sm">Correo electrónico<input name="email" type="email" defaultValue={params.get("email") || ""} readOnly={!!token} required autoComplete="email" className="field" /></label><label className="block text-sm">Contraseña<input name="password" type="password" minLength={12} maxLength={128} required autoComplete={register || token ? 'new-password' : 'current-password'} className="field" /><span className="text-xs text-slate-500">Entre 12 y 128 caracteres.</span></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button className="action w-full" type="submit">{busy ? 'Procesando…' : token ? 'Establecer contraseña y acceder' : register ? 'Crear cuenta' : 'Iniciar sesión'}</button><button hidden={!!token} type="button" className="w-full text-sm text-blue-700 underline" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Ya tengo una cuenta' : 'Crear cuenta profesional'}</button></fieldset></form></div>;
}


