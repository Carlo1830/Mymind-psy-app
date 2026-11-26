export const patientFields={telefone:'Telefone',endereco:'Endereço',emergencia_nome:'Contato de emergência: nome',emergencia_telefone:'Contato de emergência: telefone',emergencia_vinculo:'Vínculo com o contato',antecedentes:'Informações que você deseja compartilhar com sua profissional'} as const;
export type PatientProfile=Record<keyof typeof patientFields,string>;
export type PortalDocument={id:string;titulo:string;tipo:string;contenido:string;creado_en:string;publicado?:boolean};
export type PortalPetition={id:string;tipo:string;texto:string;respuesta:string|null;creado_en:string;respondido_en:string|null};
export type PatientDossier={nombre:string;email:string;fecha_nacimiento:string;profesional:string;ficha:{datos:PatientProfile;version:number;actualizado_en:string}|null;documentos:PortalDocument[];peticiones:PortalPetition[];citas:{id:string;fecha_hora:string;duracion_minutos:number;modalidad:string;estado_sesion:string}[]};
