import { requireUser } from '@/lib/auth';
import { db,patient } from '@/lib/db';
import { body,failure,InputError,json,sameOrigin } from '@/lib/api';
import { assessmentInput,severity,type ClinicalAssessment } from '@/lib/clinical-assessments';
export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
function present(row:Record<string,unknown>){
 const r=row as unknown as ClinicalAssessment;
 return {id:r.id,paciente_id:r.paciente_id,tipo_test:r.tipo_test,nombre_test:r.nombre_test,modo:r.modo,puntaje_total:r.puntaje_total,respuestas:r.respuestas,fecha_evaluacion:r.fecha_evaluacion,version_baremo:r.version_baremo,severidad:severity(r.tipo_test,r.puntaje_total),alerta_item9:r.tipo_test==='PHQ-9'&&r.respuestas.some(a=>a.item===9&&a.valor>0)};
}
export async function GET(_request:Request,context:Context){
 try{const user=await requireUser();const {id}=await context.params;if(!await patient(id,user.id))return json({error:'Paciente no encontrado.'},404);
 const rows=await db().prepare('SELECT * FROM mymind.evaluaciones_clinicas WHERE paciente_id=? AND usuario_id=? ORDER BY fecha_evaluacion DESC,creado_en DESC,id DESC').all(id,user.id);
 return json(rows.map(present));}catch(e){return failure(e);}
}
export async function POST(request:Request,context:Context){
 try{const user=await requireUser();sameOrigin(request);const {id}=await context.params;if(!await patient(id,user.id))return json({error:'Paciente no encontrado.'},404);
 const value=await body(request);let input:ReturnType<typeof assessmentInput>;
 try{input=assessmentInput(value);}catch(e){throw new InputError(e instanceof Error?e.message:'Evaluación inválida.');}
 const database=db();
 const row=await database.prepare('INSERT INTO mymind.evaluaciones_clinicas(id,usuario_id,paciente_id,tipo_test,nombre_test,modo,puntaje_total,respuestas,fecha_evaluacion) VALUES(?,?,?,?,?,?,?,?::jsonb,?) ON CONFLICT(id) DO NOTHING RETURNING *').get(input.id,user.id,id,input.tipo_test,input.nombre_test,input.modo,input.puntaje_total,JSON.stringify(input.respuestas),input.fecha_evaluacion);
 if(row)return json(present(row),201);
 const previous=await database.prepare('SELECT * FROM mymind.evaluaciones_clinicas WHERE id=? AND paciente_id=? AND usuario_id=?').get(input.id,id,user.id);
 if(previous&&previous.tipo_test===input.tipo_test&&previous.nombre_test===input.nombre_test&&previous.modo===input.modo&&previous.puntaje_total===input.puntaje_total&&previous.fecha_evaluacion===input.fecha_evaluacion&&JSON.stringify(previous.respuestas)===JSON.stringify(input.respuestas))return json(present(previous),200);
 return json({error:'El identificador ya fue utilizado. Abre un nuevo registro.'},409);
 }catch(e){return failure(e);}
}
