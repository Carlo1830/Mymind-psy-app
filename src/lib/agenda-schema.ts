import 'server-only';
import { db } from '@/lib/db';
import { HttpError } from '@/lib/errors';

export async function requireAgendaSchema() {
 const result = await db().prepare(`SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='mymind' AND table_name='usuarios'
    AND column_name IN ('google_calendar_token','sync_enabled','recordatorios_email','recordatorios_whatsapp','recordatorio_horas')) AS user_columns,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='mymind' AND table_name='sesiones' AND column_name='estado_confirmacion') AS session_columns,
  to_regclass('mymind.agenda_emails') IS NOT NULL AS queue_exists`).get();
 if (Number(result?.user_columns)!==5 || Number(result?.session_columns)!==1 || !result?.queue_exists)
  throw new HttpError(503,'Los ajustes avanzados de agenda requieren aplicar la migración 202610190001_agenda_integrations.sql en Supabase. Puedes seguir utilizando el calendario básico.');
}
