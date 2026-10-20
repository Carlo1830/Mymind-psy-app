export const tagKey=(value:string)=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
export function patientTags(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>20)throw new Error('Selecciona como máximo 20 etiquetas.');
 const result:string[]=[];const seen=new Set<string>();
 for(const item of value){
  if(typeof item!=='string')throw new Error('Cada etiqueta debe ser texto.');
  const label=item.normalize('NFC').trim().replace(/\s+/g,' ');
  if(!label||label.length>50)throw new Error('Cada etiqueta debe tener entre 1 y 50 caracteres.');
  const key=tagKey(label);if(!seen.has(key)){seen.add(key);result.push(label);}
 }
 return result;
}
