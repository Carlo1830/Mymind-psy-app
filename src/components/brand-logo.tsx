import Image from 'next/image';

export function BrandLogo() {
  return <Image src="/images/logo-emnos.png" alt="" width={40} height={48} className="h-12 w-10 shrink-0 object-contain" />;
}
