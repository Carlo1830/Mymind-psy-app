import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure,json } from '@/lib/api';
import { tagKey } from '@/lib/patient-tags';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
 try{
  const user=await requireUser();
  const rows=await db().prepare("SELECT DISTINCT jsonb_array_elements_text(COALESCE(to_jsonb(p)->'etiquetas','[]'::jsonb)) AS etiqueta FROM pacientes p WHERE p.usuario_id=? ORDER BY etiqueta").all(user.id);
  const labels=new Map<string,string>();
  for(const row of rows){const label=String(row.etiqueta);if(!labels.has(tagKey(label)))labels.set(tagKey(label),label);}
  return json([...labels.values()].sort((a,b)=>a.localeCompare(b,'es')));
 }catch(e){return failure(e);}
}
