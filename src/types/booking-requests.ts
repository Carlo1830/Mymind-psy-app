export type BookingSlot={id:string;fecha_hora:string;duracion_minutos:number;modalidad:string};
export type BookingRules={solicitud_anticipacion_horas:number;solicitud_respuesta_horas:number};
export type BookingRequest={
 id:string;fecha_hora:string;duracion_minutos:number;modalidad:string;
 estado:'pendiente'|'aceptada'|'rechazada'|'alternativa'|'vencida';
 creado_en:string;vence_en:string;respondido_en:string|null;mensaje:string;
 alternativa_horario_id:string|null;alternativa_fecha:string|null;alternativa_modalidad:string|null;alternativa_duracion:number|null;
 nombre_completo?:string;paciente_id?:string;
 cita?:{fecha_hora:string;duracion_minutos:number;modalidad:string;estado:string}|null;
};
export const bookingStatus={pendiente:'Pendiente de confirmación',aceptada:'Confirmada',rechazada:'Rechazada',alternativa:'Otro horario propuesto',vencida:'Solicitud vencida'};
export function bookingDate(value:string,zone?:string){return new Date(value).toLocaleString('es-CL',{timeZone:zone,dateStyle:'medium',timeStyle:'short'});}
export function randomTrackingToken(){return crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');}
