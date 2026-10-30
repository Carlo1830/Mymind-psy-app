/** Weekly recurrences keep the wall clock time in the selected IANA zone. */
export function recurrenceDates(start: string, count: number, weeks: number, zone: string): string[] {
 if (!Number.isInteger(count) || count < 1 || count > 52 || ![1,2,4].includes(weeks)) throw Error('Selecciona entre 1 y 52 citas, cada 1, 2 o 4 semanas.');
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const wall=(ms:number)=>{const p=Object.fromEntries(format.formatToParts(new Date(ms)).map(p=>[p.type,p.value]));return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);};
 const first=Date.parse(start); if(!Number.isFinite(first))throw Error('Fecha inválida.');
 const local=wall(first);
 return Array.from({length:count},(_,i)=>{
  if(i===0)return new Date(first).toISOString();
  const target=local+i*weeks*7*86400000;
  let result=target;
  for(let n=0;n<4;n++)result+=target-wall(result);
  if(wall(result)!==target)throw Error('Una repetición cae en una hora inexistente por cambio de horario. Elige otra hora.');
  // Ambiguous wall times require an explicit decision rather than silently shifting a session.
  if(wall(result-3600000)===target||wall(result+3600000)===target)throw Error('Una repetición cae en una hora ambigua por cambio de horario. Elige otra hora.');
  return new Date(result).toISOString();
 });
}
