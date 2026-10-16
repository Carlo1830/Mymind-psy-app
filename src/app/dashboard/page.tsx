import { requirePageUser } from '@/lib/auth';
import { DailyAgenda } from '@/components/daily-agenda';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi consulta' };
export default async function DashboardPage() {
  const user = await requirePageUser();
  return <DailyAgenda name={user.nombre} />;
}
