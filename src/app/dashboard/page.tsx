import { requirePageUser } from '@/lib/auth';
import { PageHeading } from '@/components/page-heading';
import { DashboardSummary } from '@/components/dashboard-summary';
export const metadata = { title: 'Mi consulta' };
export default async function DashboardPage() { const user = await requirePageUser(); return <><PageHeading title="Tu consulta, en calma" description={`Hola, ${user.nombre}. Un vistazo a las personas, los encuentros y los nuevos contactos de tu consulta.`} /><DashboardSummary /></>; }
