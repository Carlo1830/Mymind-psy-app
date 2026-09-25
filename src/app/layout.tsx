import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Mymind | Resumen', template: '%s | Mymind' },
  description: 'Gestión de pacientes, sesiones y marketing para la consulta psicológica.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><a href="#contenido" className="sr-only focus:not-sr-only">Saltar al contenido</a><AppShell>{children}</AppShell></body></html>;
}

