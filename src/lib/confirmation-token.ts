import { createHmac, timingSafeEqual } from 'node:crypto';
export function confirmationToken(id:string,date:string,modality:string,duration:number,revision=0) {
 const secret=process.env.AGENDA_CONFIRMATION_SECRET;
 if(!secret)return null;
 return createHmac('sha256',secret).update(JSON.stringify([id,date,modality,duration,revision])).digest('hex');
}
export function validConfirmation(token:unknown,id:string,date:string,modality:string,duration:number,revision=0) {
 const expected=confirmationToken(id,date,modality,duration,revision);
 if(!expected||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return false;
 return timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(expected,'hex'));
}
