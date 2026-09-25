export function EmptyState({ title, description }: { title: string; description: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center"><h2 className="text-lg font-semibold">{title}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">{description}</p></section>;
}
