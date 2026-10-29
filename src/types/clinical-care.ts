export const profileLabels = {
 fecha_nacimiento: 'Fecha de nacimiento', documento_identidad: 'Documento de identidad (opcional)',
 emergencia_nombre: 'Contacto de emergencia: nombre', emergencia_telefono: 'Contacto de emergencia: teléfono', emergencia_vinculo: 'Vínculo del contacto de emergencia',
 representante_nombre: 'Representante: nombre', representante_telefono: 'Representante: teléfono', representante_vinculo: 'Vínculo del representante',
} as const;
export type ProfileData = Record<keyof typeof profileLabels,string>;
export const noteLabels = {resumen:'Resumen de la sesión',intervenciones:'Intervenciones realizadas',evolucion:'Evolución y observaciones',proximos_pasos:'Acuerdos y próximos pasos'} as const;
export type NoteContent = Record<keyof typeof noteLabels,string>;
export type CareProfile = {datos:ProfileData;version:number;actualizado_en:string;autor:string};
export type Goal = {id:string;titulo:string;descripcion:string|null;criterio_logro:string|null;estado:'activo'|'logrado'|'pausado';fecha_revision:string|null;version:number;actualizado_en:string;autor:string};
export type NoteSummary = {id:string;sesion_id:string;fecha_hora:string;estado:'borrador'|'finalizada';version:number;actualizado_en:string;autor:string;finalizada_en:string|null};
export type ClinicalNote = NoteSummary & {contenido:NoteContent};
export type Revision = {version:number;contenido:NoteContent;estado:string;registrado_en:string;autor:string};
export type Addendum = {id:string;texto:string;registrado_en:string;autor:string};
export type CareEvent = {id:number;accion:string;recurso_id:string|null;version:number|null;registrado_en:string;autor:string};
export type CareState = {ficha:CareProfile|null;objetivos:Goal[];notas:NoteSummary[];eventos:CareEvent[]};
export type NoteDetail = {nota:ClinicalNote;revisiones:Revision[];adendas:Addendum[]};
export const emptyNote = ():NoteContent=>({resumen:'',intervenciones:'',evolucion:'',proximos_pasos:''});
