import { requireUser } from '@/lib/auth';
import { db,patient } from '@/lib/db';
import { body,failure,field,InputError,json,sameOrigin } from '@/lib/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function PUT(request:Request,context:{params:Promise<{id:string}>}){
 try{
  const user=await requireUser();sameOrigin(request);const {id}=await context.params;
  if(!await patient(id,user.id))return json({error:'Paciente no encontrado.'},404);
  const value=await body(request);
  for(const key of ['motivo_consulta','antecedentes','hipotesis_diagnostica']){
   if(!(key in value))throw new InputError('Incluye las tres secciones del expediente.');
  }
  const motivo=field(value.motivo_consulta,'Motivo de consulta',10000);
  const antecedentes=field(value.antecedentes,'Antecedentes',20000);
  const hipotesis=field(value.hipotesis_diagnostica,'Formulación clínica',20000);
  if(typeof value.expediente_version!=='number'||!Number.isSafeInteger(value.expediente_version)||value.expediente_version<0)throw new InputError('Versión de expediente inválida.');
  const row=await db().prepare('UPDATE pacientes SET motivo_consulta=?,antecedentes=?,hipotesis_diagnostica=? WHERE id=? AND usuario_id=? AND expediente_version=? RETURNING motivo_consulta,antecedentes,hipotesis_diagnostica,expediente_version').get(motivo,antecedentes,hipotesis,id,user.id,value.expediente_version);
  if(!row)return json({error:'El expediente cambió desde que lo abriste. Conserva tu borrador y vuelve a abrir la ficha antes de actualizar.'},409);
  return json(row);
 }catch(e){return failure(e);}
}
