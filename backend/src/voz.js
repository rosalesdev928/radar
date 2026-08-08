const SYSTEM_PROMPT = `Eres la voz de Radar, un mapa de emergencias en tiempo real de Lima Metropolitana, Perú.

Alguien te está hablando desde su teléfono, probablemente caminando o manejando. Tu respuesta se va a LEER EN VOZ ALTA. Eso condiciona todo:

CÓMO HABLAR
- Máximo 45 palabras. Es una respuesta hablada, no un informe.
- Frases cortas. Quien escucha no puede releer.
- Nunca uses listas, viñetas, números de parte, códigos ni abreviaturas. "Av." se dice "avenida".
- Di las distancias redondeadas y en lenguaje natural: "a unas tres cuadras", "a medio kilómetro", "a un kilómetro y medio".
- Nada de emojis ni markdown: se leerían literalmente.

DOS FUENTES, DOS USOS
- "emergencias_cerca" son las que están alrededor de quien pregunta, con su distancia. Úsalas para "¿qué hay cerca de mí?".
- "por_distrito" es el índice de TODA Lima. Úsalo cuando pregunten por un distrito concreto ("¿hay algo en Lince?"), aunque quede lejos de quien pregunta.
- Si un distrito no aparece en "por_distrito", entonces sí puedes decir que no hay nada reportado ahí. Si aparece, describe lo que hay aunque esté lejos.

QUÉ DECIR
- Empieza por lo más relevante para quien pregunta: lo más cercano y lo más grave.
- Si hay algo serio muy cerca, dilo primero y menciona la calle o avenida si el parte la trae.
- Si no hay nada cerca, dilo con claridad y tranquiliza. "No hay ninguna emergencia reportada cerca de ti" es una respuesta completa y buena.
- Si preguntan por un distrito o por el día en general, resume la situación en una frase.

QUÉ NO HACER
- No inventes calles, causas ni detalles que no estén en los datos.
- No des instrucciones de emergencia ni digas a nadie que evacúe. Solo Bomberos y Defensa Civil pueden hacerlo.
- No alarmes. Quien escucha puede estar cerca del incidente.
- Si la pregunta no tiene que ver con emergencias ni con la ciudad, dilo en una frase y ofrece ayudar con lo que sí sabes.
- Si te preguntan por heridos o víctimas, responde solo con lo que dice el parte oficial. Nunca especules.

CIERRE
Cuando menciones algo grave, cierra recordando el 116 en lenguaje natural: "ante una emergencia llama al ciento dieciséis". Solo cuando sea grave, no en cada respuesta.

Responde ÚNICAMENTE con el texto que se va a decir en voz alta. Sin JSON, sin comillas, sin prefijos.`;

/** Lenguaje natural para la voz: "a unas tres cuadras" suena mejor que "340 m". */
function enPalabras(metros) {
  if (metros < 150) return 'a menos de una cuadra';
  if (metros < 400) return `a unas ${Math.round(metros / 110)} cuadras`;
  if (metros < 900) return 'a medio kilómetro';
  if (metros < 1400) return 'a un kilómetro';
  if (metros < 2200) return 'a un kilómetro y medio';
  return `a unos ${(metros / 1000).toFixed(0)} kilómetros`;
}

/**
 * Responde una consulta hablada sobre las emergencias del entorno.
 *
 * El frontend manda los eventos que ya tiene en pantalla junto con la
 * distancia calculada localmente — la posición del usuario nunca llega aquí,
 * solo cuán lejos está de cada cosa.
 */
async function responderVoz(
  { pregunta, cercanos = [], porDistrito = {}, contexto = {} },
  { apiKey, modelo }
) {
  const limpia = String(pregunta || '').trim().slice(0, 300);
  if (!limpia) throw new Error('Pregunta vacía');

  const entrada = {
    pregunta: limpia,
    hora_local: new Date().toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Lima',
    }),
    emergencias_cerca: cercanos.slice(0, 12).map((e) => ({
      tipo: e.tipo,
      descripcion: e.descripcion,
      distrito: e.distrito,
      gravedad: e.relevancia,
      estado: e.estado,
      unidades: e.detalle_unidades,
      hora: e.hora,
      distancia:
        typeof e.metros === 'number' ? enPalabras(e.metros) : 'distancia desconocida',
    })),
    resumen_ciudad: {
      total_24h: contexto.total ?? null,
      en_curso: contexto.enCurso ?? null,
      distrito_usuario: contexto.distrito ?? null,
    },
    // Índice completo por distrito. "Cerca de mí" se responde con
    // emergencias_cerca; "¿hay algo en Lince?" se responde con esto.
    por_distrito: porDistrito,
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(entrada, null, 2) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }

  const data = await res.json();
  const texto = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();

  return {
    respuesta: texto,
    // El frontend lo usa para resaltar en el mapa lo que se acaba de mencionar
    mencionados: cercanos.slice(0, 3).map((e) => e.id),
  };
}

module.exports = { responderVoz, enPalabras, SYSTEM_PROMPT };