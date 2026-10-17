import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'EmNós - Espacio para tu consulta', template: '%s | EmNós' },
  description: 'EmNós. Un espacio para escucharte. Un tiempo para ti. Acompañamiento psicológico y un espacio sereno para tu consulta.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><a href="#contenido" className="sr-only focus:not-sr-only">Saltar al contenido</a><AppShell>{children}</AppShell></body></html>;
}

