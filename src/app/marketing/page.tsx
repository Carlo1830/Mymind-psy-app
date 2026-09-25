import { requirePageUser } from '@/lib/auth';
import { PageHeading } from '@/components/page-heading';
import { MarketingSuite } from '@/components/marketing-suite';
export const metadata = { title: 'Marketing y perfil profesional' };
export default async function MarketingPage() {
  await requirePageUser();
  return <><PageHeading title="Tu estudio de comunicación" description="Construye una presencia profesional coherente y facilita el primer contacto con tu consulta." /><MarketingSuite /></>;
}
