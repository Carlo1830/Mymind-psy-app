export function PageHeading({ title, description }: { title: string; description: string }) {
  return <header className="mb-8"><p className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-teal-600 uppercase">Mymind · Espacio profesional</p><h1 className="font-serif text-4xl tracking-tight text-slate-800 md:text-[2.6rem]">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></header>;
}
