import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyEmailWebhook(raw:string,headers:Headers,secret:string,now=Date.now()) {
 const id=headers.get('svix-id'),timestamp=headers.get('svix-timestamp'),signatures=headers.get('svix-signature');
 if(!id||!timestamp||!signatures||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)return false;
 const key=Buffer.from(secret.replace(/^whsec_/,''),'base64');
 const expected=createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest();
 return signatures.split(' ').some(part=>{const [version,signature]=part.split(',');if(version!=='v1'||!signature)return false;const actual=Buffer.from(signature,'base64');return actual.length===expected.length&&timingSafeEqual(actual,expected);});
}
