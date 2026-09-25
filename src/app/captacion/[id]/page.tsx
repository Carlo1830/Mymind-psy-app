import { PublicCapture } from '@/components/public-capture';
export const metadata = { title: 'Recurso de bienestar', robots: { index: false, follow: false } };
export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) { return <PublicCapture id={(await params).id} />; }
