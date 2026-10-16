// Use only the name explicitly saved in the authenticated professional's profile.
export function greetingName(name: string | null | undefined): string | null {
  const normalized = name?.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.toLocaleLowerCase('es') === 'profesional principal') return null;
  return normalized.split(' ')[0];
}
