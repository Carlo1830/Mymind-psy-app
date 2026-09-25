import { HttpError } from '@/lib/errors';
import { NextResponse } from 'next/server';
export const estados = ['Nuevo contacto', 'En evaluación', 'Tratamiento activo', 'Inactivo'] as const;
export class InputError extends Error {}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 100000) { await reader.cancel(); throw new HttpError(413, 'Solicitud demasiado grande.'); }
      chunks.push(value);
    }
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  let value;
  try { value = JSON.parse(raw); } catch { throw new InputError('El cuerpo debe ser JSON válido.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Datos inválidos.');
  return value;
}
export function field(value: unknown, label: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new InputError(`${label} es obligatorio.`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > max) throw new InputError(`${label} no es válido (máximo ${max} caracteres).`);
  const result = value.trim();
  if (required && !result) throw new InputError(`${label} es obligatorio.`);
  return result || null;
}
export function patientInput(value: Record<string, unknown>) {
  const name = field(value.nombre_completo, 'Nombre completo', 200, true);
  const email = field(value.email, 'Correo electrónico', 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Correo electrónico inválido.');
  if (!estados.includes(value.estado as typeof estados[number])) throw new InputError('Estado inválido.');
  return [name, email, field(value.telefono, 'Teléfono', 50), value.estado as string, field(value.motivo_consulta, 'Motivo de consulta', 10000), field(value.notas_confidenciales, 'Notas confidenciales', 20000)];
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof InputError) return json({ error: error.message }, 400);
  return json({ error: 'No se pudo completar la operación. Inténtalo de nuevo.' }, 500);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Origen no permitido.');
  if (!origin) return;
  const host = request.headers.get('host');
  const expected = process.env.APP_ORIGIN;
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new HttpError(403, 'Origen no permitido.'); }
  if ((expected && parsed.origin !== new URL(expected).origin) || (!expected && parsed.host !== host)) throw new HttpError(403, 'Origen no permitido.');
}

