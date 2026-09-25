export const templateDefaults = [
  { nombre: 'Bienvenida a la consulta', categoria: 'bienvenida', paso: 1, dias_espera: 0, asunto: 'Bienvenida a la consulta', contenido: 'Hola {{nombre_paciente}}, soy {{nombre_profesional}}. Gracias por ponerte en contacto. Podemos conversar sobre tu disponibilidad y cómo funciona la consulta. Puedes solicitar una cita aquí: {{enlace_consulta}}.' },
  { nombre: 'Recordatorio de sesión', categoria: 'recordatorio', paso: 1, dias_espera: 0, asunto: 'Recordatorio de tu cita', contenido: 'Hola {{nombre_paciente}}, te recuerdo nuestra cita del {{fecha_hora}}. Si necesitas reprogramar, por favor avísame. Un saludo, {{nombre_profesional}}.' },
  { nombre: 'Seguimiento inicial', categoria: 'seguimiento', paso: 1, dias_espera: 3, asunto: 'Seguimiento de tu solicitud', contenido: 'Hola {{nombre_paciente}}, soy {{nombre_profesional}}. Te escribo para saber si tienes preguntas sobre la consulta. Si deseas agendar: {{enlace_consulta}}. Si prefieres no recibir más mensajes, puedes indicármelo.' },
  { nombre: 'Segundo seguimiento', categoria: 'seguimiento', paso: 2, dias_espera: 7, asunto: '¿Necesitas más información?', contenido: 'Hola {{nombre_paciente}}, si aún te interesa una consulta, estoy disponible para responder tus preguntas. Puedes escribirme cuando lo necesites. {{nombre_profesional}}.' },
  { nombre: 'Reactivación respetuosa', categoria: 'reactivacion', paso: 1, dias_espera: 30, asunto: 'Retomar el contacto', contenido: 'Hola {{nombre_paciente}}, soy {{nombre_profesional}}. Si deseas retomar las sesiones, podemos revisar disponibilidad: {{enlace_consulta}}. No necesitas responder si no es el momento. Puedes pedirme que no te contacte nuevamente.' },
];
export const topics = ['Ataques de Pánico', 'Burnout Laboral', 'Gestión Emocional', 'Autoestima'];
export const formats = ['Instagram Post', 'Reel Script', 'Artículo LinkedIn'];
export const tones = ['Empático', 'Educativo', 'Clínico/Divulgativo'];
export type Template = { id: string; nombre: string; categoria: string; paso: number; dias_espera: number; asunto: string; contenido: string };
export type Resource = { id: string; titulo: string; descripcion: string; tipo: 'guia' | 'test'; contenido: string; preguntas: string[]; publicado: boolean; captaciones?: number };
export const consentText = 'Autorizo a este profesional a registrar mi nombre y correo para entregarme el recurso y atender mi solicitud de contacto.';
