import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';
export const metadata = { title: 'Acceso profesional' };
export default function AccessPage() { return <Suspense fallback={<p>Cargando acceso…</p>}><AuthForm /></Suspense>; }

