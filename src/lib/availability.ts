import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { dayKey, dayStart } from '@/lib/periods';
export async function generateAvailability(owner: string, zone: string) {
  const database = db();
  const today = dayKey(new Date(), zone);
  const initial = await database.prepare('SELECT activa, generado_dia FROM reglas_disponibilidad WHERE usuario_id = ?').get(owner);
  if (!initial || initial.activa !== 1 || initial.generado_dia === today) return;
  await database.begin(owner);
  try {
    const rule = await database.prepare('SELECT * FROM reglas_disponibilidad WHERE usuario_id = ?').get(owner);
    if (!rule || rule.activa !== 1 || rule.generado_dia === today) { await database.exec('COMMIT'); return; }
    const days = JSON.parse(String(rule.dias)) as number[];
    const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const start = minutes(String(rule.hora_inicio)), end = minutes(String(rule.hora_fin));
    const slots: { id: string; fecha_hora: string }[] = [];
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false });
    for (let index = 0; index < 90; index++) {
      const date = new Date(today + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + index);
      if (!days.includes(date.getUTCDay())) continue;
      const midnight = Date.parse(dayStart(date.toISOString().slice(0, 10), zone));
      for (let minute = start; minute + Number(rule.duracion_minutos) <= end; minute += Number(rule.duracion_minutos)) {
        const iso = new Date(midnight + minute * 60000);
        const parts = clock.formatToParts(iso);
        const actual = Number(parts.find(p => p.type === 'hour')!.value) * 60 + Number(parts.find(p => p.type === 'minute')!.value);
        const corrected = new Date(iso.getTime() + (minute - actual) * 60000).toISOString();
        if (Date.parse(corrected) >= Date.now() + 3600000) slots.push({ id: randomUUID(), fecha_hora: corrected });
      }
    }
    // One batch avoids hundreds of network round trips in a serverless request.
    await database.prepare(`INSERT INTO disponibilidad_publica (id, usuario_id, fecha_hora, duracion_minutos, modalidad, regla_version)
      SELECT x.id, ?::text, x.fecha_hora, ?::integer, ?::text, ?::integer
      FROM jsonb_to_recordset(?::jsonb) AS x(id text, fecha_hora timestamptz)
      WHERE NOT EXISTS (SELECT 1 FROM disponibilidad_publica d WHERE d.usuario_id = ? AND
        ((d.fecha_hora = x.fecha_hora AND (d.sesion_id IS NOT NULL OR d.regla_version = 0 OR d.regla_version = ?)) OR
         (d.publicado = 1 AND d.fecha_hora != x.fecha_hora AND d.fecha_hora < x.fecha_hora + ? * interval '1 minute'
          AND d.fecha_hora + d.duracion_minutos * interval '1 minute' > x.fecha_hora)))
      ON CONFLICT(usuario_id, fecha_hora) DO UPDATE SET duracion_minutos = excluded.duracion_minutos, modalidad = excluded.modalidad,
        regla_version = excluded.regla_version, publicado = 1
      WHERE disponibilidad_publica.sesion_id IS NULL AND disponibilidad_publica.regla_version > 0`).run(owner, rule.duracion_minutos, rule.modalidad, rule.version, JSON.stringify(slots), owner, rule.version, rule.duracion_minutos);
    await database.prepare('UPDATE reglas_disponibilidad SET generado_dia = ? WHERE usuario_id = ?').run(today, owner);
    await database.exec('COMMIT');
  } catch (e) { await database.exec('ROLLBACK'); throw e; }
}
