import { requirePageUser } from '@/lib/auth';
import { Suspense } from 'react';
import { PageHeading } from '@/components/page-heading';
import { PatientsCRM } from '@/components/patients-crm';
export const metadata = { title: 'Pacientes' };
export default async function PacientesPage() {
  await requirePageUser();
  return <><PageHeading title="Pacientes" description="El CRM de tu consulta: nuevos contactos, evaluación y seguimiento del tratamiento." /><Suspense fallback={<p>Cargando pacientes…</p>}><PatientsCRM /></Suspense></>;
}


