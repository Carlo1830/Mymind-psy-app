import {requireUser} from '@/lib/auth';
import {body,failure,json,sameOrigin} from '@/lib/api';
import {careState,mutateCare} from '@/lib/clinical-care';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 try{const user=await requireUser();const {id}=await context.params;return json(await careState(id,user.id,new URL(request.url).searchParams.get('nota')));}catch(e){return failure(e);}
}
export async function POST(request:Request,context:Context){
 try{const user=await requireUser();sameOrigin(request);const {id}=await context.params;return json(await mutateCare(id,user.id,await body(request)));}catch(e){return failure(e);}
}
