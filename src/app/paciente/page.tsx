import { redirect } from 'next/navigation';
import { currentPatient } from '@/lib/patient-account';
import { PatientWorkspace } from '@/components/patient-workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Meu espaço',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page(){if(!await currentPatient())redirect('/paciente/acceso');return <PatientWorkspace/>;}
