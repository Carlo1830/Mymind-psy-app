import { AvailabilityEditor } from '@/components/availability-editor';
import { requirePageUser } from '@/lib/auth';
import { PageHeading } from '@/components/page-heading';
import { Calendar } from '@/components/calendar';
export const metadata = { title: 'Calendario y citas' };
export default async function CalendarioPage() {
  await requirePageUser();
  return <><PageHeading title="Calendario y citas" description="Organiza tu agenda y el seguimiento de cada paciente." /><Calendar /><AvailabilityEditor /></>;
}



