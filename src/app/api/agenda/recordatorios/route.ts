import { timingSafeEqual } from 'node:crypto';
import { failure,json } from '@/lib/api';
import { processAgendaEmails } from '@/lib/agenda-email';
import { expireRequests } from '@/lib/booking-requests';
import { processRequestNotifications } from '@/lib/request-notifications';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 const actual=Buffer.from(request.headers.get('authorization')||'');const expected=Buffer.from('Bearer '+secret);
 if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return json({error:'No autorizado.'},401);
 try{await expireRequests();return json({agenda:await processAgendaEmails(),solicitudes:await processRequestNotifications()});}catch(e){return failure(e);}
}
