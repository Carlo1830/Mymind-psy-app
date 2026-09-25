"use client";
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === '/') return <main id="contenido">{children}</main>;
  const publicPage = path === '/acceso' || path.startsWith('/captacion/');
  return <div className="min-h-screen md:flex">{!publicPage && <Sidebar />}<main id="contenido" className="min-w-0 flex-1 p-5 md:p-8 xl:p-12"><div className="mx-auto max-w-[1440px]">{children}</div></main></div>;
}
