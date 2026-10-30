import { AgendaDeliveries } from '@/components/agenda-deliveries';
import { AvailabilityEditor } from '@/components/availability-editor';
import { requirePageUser } from '@/lib/auth';
import { PageHeading } from '@/components/page-heading';
import { AgendaSettings } from '@/components/agenda-settings';
import { Calendar } from '@/components/calendar';
export const metadata = { title: 'Calendario y citas' };
export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  await requirePageUser();
  const { nueva } = await searchParams;
  return <><PageHeading title="Calendario y citas" description="Organiza tu agenda y el seguimiento de cada paciente." /><Calendar createNew={nueva === '1'} /><AvailabilityEditor /><AgendaSettings /><AgendaDeliveries /></>;
}



