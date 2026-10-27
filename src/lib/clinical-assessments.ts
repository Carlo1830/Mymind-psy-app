export const testTypes=['PHQ-9','GAD-7','Personalizado'] as const;
export type TestType=typeof testTypes[number];
export type TestAnswer={item:number;valor:number};
export type ClinicalAssessment={id:string;paciente_id:string;tipo_test:TestType;nombre_test:string|null;modo:'respuestas'|'puntaje';puntaje_total:number;respuestas:TestAnswer[];fecha_evaluacion:string;severidad:string;alerta_item9:boolean;version_baremo:string};
export function severity(type:TestType,score:number){
 if(type==='Personalizado')return 'Sin baremo';
 if(score<5)return 'Mínimo';if(score<10)return 'Leve';if(score<15)return 'Moderado';
 if(type==='GAD-7'||score>=20)return 'Severo';return 'Moderadamente severo';
}
export function assessmentInput(value:Record<string,unknown>){
 if(!testTypes.includes(value.tipo_test as TestType))throw Error('Selecciona una escala válida.');
 const type=value.tipo_test as TestType;
 const mode=value.modo;if(mode!=='respuestas'&&mode!=='puntaje')throw Error('Modo de registro inválido.');
 if(typeof value.fecha_evaluacion!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value.fecha_evaluacion))throw Error('La fecha debe estar en formato ISO UTC.');
 const date=new Date(value.fecha_evaluacion);
 if(Number.isFinite(date.getTime())&&date.toISOString()!==value.fecha_evaluacion.replace(/Z$/,value.fecha_evaluacion.includes('.')?'Z':'.000Z'))throw Error('Fecha inexistente.');
 if(!Number.isFinite(date.getTime())||date.getTime()>Date.now()+60000)throw Error('Indica una fecha válida que no esté en el futuro.');
 let answers:TestAnswer[]=[];let score:number;
 if(mode==='respuestas'){
  const count=type==='PHQ-9'?9:type==='GAD-7'?7:0;
  if(!count||!Array.isArray(value.respuestas)||value.respuestas.length!==count)throw Error('Completa todos los ítems de la escala.');
  answers=value.respuestas.map((answer:unknown,index:number)=>{
   if(!answer||typeof answer!=='object'||!('item' in answer)||!('valor' in answer)||answer.item!==index+1||typeof answer.valor!=='number'||!Number.isInteger(answer.valor)||answer.valor<0||answer.valor>3)throw Error('Cada ítem debe tener una respuesta entre 0 y 3, en orden y sin duplicados.');
   return {item:index+1,valor:answer.valor};
  });score=answers.reduce((sum,a)=>sum+a.valor,0);
 }else{
  if(value.respuestas!==undefined&&(!Array.isArray(value.respuestas)||value.respuestas.length))throw Error('El puntaje directo no admite respuestas de ítems.');
  if(typeof value.puntaje_total!=='number'||!Number.isInteger(value.puntaje_total))throw Error('El puntaje debe ser entero.');
  score=value.puntaje_total;
 }
 const max=type==='PHQ-9'?27:type==='GAD-7'?21:10000;
 if(score<0||score>max)throw Error('Puntaje fuera del rango de la escala.');
 const name=type==='Personalizado'&&typeof value.nombre_test==='string'?value.nombre_test.trim():null;
 if(type==='Personalizado'&&(!name||name.length>100))throw Error('Indica el nombre del test personalizado (hasta 100 caracteres).');
 if(typeof value.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id))throw Error('Identificador de registro inválido.');
 return {id:value.id,tipo_test:type,nombre_test:name,modo:mode,puntaje_total:score,respuestas:answers,fecha_evaluacion:date.toISOString()};
}
