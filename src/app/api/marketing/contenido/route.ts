import { requireUser } from '@/lib/auth';
import { body, failure, InputError, json, sameOrigin } from '@/lib/api';
import { topics, formats, tones } from '@/lib/marketing-shared';
export const runtime = 'nodejs';
const library: Record<string, { hook: string; idea: string; reflection: string; tags: string }> = {
  'Ataques de Pánico': { hook: 'Hablar del miedo también merece un espacio.', idea: 'Una experiencia de miedo intenso puede ser difícil de contar. Describir qué ocurrió, en qué contexto y qué apoyo necesitas puede abrir una conversación con un profesional. Una publicación no permite determinar la causa de síntomas físicos ni sustituye una valoración individual.', reflection: 'Reflexión: ¿qué te gustaría que una persona de confianza comprendiera sobre tu experiencia? Puedes anotarlo con tus propias palabras, sin exigirte una explicación perfecta.', tags: '#SaludMental #Pánico #AcompañamientoPsicológico' },
  'Burnout Laboral': { hook: '¿Qué espacio queda para ti fuera del trabajo?', idea: 'Hablar del desgaste laboral implica mirar tanto la experiencia personal como las condiciones de trabajo. Antes de asumir que todo depende de organizarte mejor, identifica qué demandas existen y qué apoyos están disponibles.', reflection: 'Reflexión: escribe una demanda de tu jornada, un apoyo disponible y un límite que te gustaría conversar con tu equipo.', tags: '#BienestarLaboral #Burnout #SaludMental' },
  'Gestión Emocional': { hook: 'Tus emociones también pueden tener palabras.', idea: 'No tienes que encontrar de inmediato una explicación para todo lo que sientes. Puedes comenzar por describir tu experiencia y el contexto en que aparece, sin reducirla a una emoción correcta o incorrecta.', reflection: 'Reflexión: completa a tu ritmo: «En este momento noto…», «Lo que me importa es…» y «El apoyo que me gustaría pedir es…».', tags: '#GestiónEmocional #Autoconocimiento #Psicología' },
  'Autoestima': { hook: '¿Cómo te hablas cuando algo no sale como esperabas?', idea: 'Una dificultad puntual no resume toda tu historia. Revisar las palabras que usas contigo puede ser un punto de partida para conversar sobre tus expectativas, necesidades y relaciones.', reflection: 'Reflexión: recuerda una frase exigente que te hayas dicho. ¿Cómo expresarías la misma preocupación a alguien a quien aprecias, sin descalificarlo?', tags: '#Autoestima #Autoconocimiento #CuidadoPersonal' },
};
export async function POST(request: Request) {
  try {
    const user = await requireUser(); sameOrigin(request);
    const v = await body(request);
    if (!topics.includes(String(v.tema)) || !formats.includes(String(v.formato)) || !tones.includes(String(v.tono))) throw new InputError('Selecciona un tema, formato y tono válidos.');
    const entry = library[String(v.tema)];
    const intro = v.tono === 'Empático' ? 'Podemos acercarnos a este tema con calma y sin juzgarnos.' : v.tono === 'Educativo' ? 'Una idea para explorar este tema paso a paso:' : 'Perspectiva divulgativa: conviene distinguir la reflexión general de la valoración clínica individual.';
    let hook = entry.hook;
    let development = `${intro}\n\n${entry.idea}`;
    let exercise = entry.reflection;
    if (v.formato === 'Reel Script') {
      hook = `[0–5 s · Texto en pantalla] ${entry.hook}`;
      development = `[5–25 s · A cámara]\n${intro}\n${entry.idea}\n\n[25–35 s · Pausa visual] Invita a pensar, sin mostrar historias ni datos de pacientes.`;
      exercise = `[35–50 s · Cierre reflexivo]\n${entry.reflection}`;
    } else if (v.formato === 'Artículo LinkedIn') {
      development = `${intro}\n\nCONTEXTO\n${entry.idea}\n\nPARA ABRIR LA CONVERSACIÓN\nHablar de ${String(v.tema).toLowerCase()} requiere atender a las circunstancias de cada persona. Un contenido general puede proponer preguntas; la consulta permite explorar una situación particular.\n\nPREGUNTA PARA LA COMUNIDAD\n¿Qué recursos o conversaciones te gustaría que estuvieran más presentes en tu entorno? Evita compartir información privada en comentarios.`;
    }
    const cta = `Si deseas explorar tu situación en consulta, puedes contactar con ${user.nombre}${user.especialidad ? ` (${user.especialidad})` : ''}.${user.enlace_consulta ? ` Agenda aquí: ${user.enlace_consulta}` : ' Escríbeme para consultar disponibilidad.'}`;
    return json({ gancho: hook, desarrollo: development, ejercicio: exercise, cta, hashtags: entry.tags, aviso: 'Borrador editorial generado con plantillas locales. Revisa y adapta antes de publicar. Contenido general, no diagnóstico ni consejo clínico individual.' });
  } catch (e) { return failure(e); }
}
