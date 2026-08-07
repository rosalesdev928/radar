const SYSTEM_PROMPT = `Eres el analista de verificación cruzada de Radar, un mapa de emergencias en tiempo real para Lima Metropolitana, Perú.

CONTEXTO
Recibirás tres cosas:
1. Un PARTE OFICIAL del Cuerpo General de Bomberos del Perú. Es la fuente autoritativa: lo que dice es cierto.
2. Un HILO CIUDADANO: mensajes escritos por vecinos que dicen estar cerca del lugar. Es texto libre, informal, con faltas de ortografía, y puede contener ruido, bromas, o gente que no está realmente ahí.
3. Una VOTACIÓN: conteo de botones que los vecinos pulsaron sobre este incidente.

TU TAREA
Leer el hilo y decirle a alguien que llega nuevo qué está pasando realmente, sin que tenga que leer 30 mensajes.

Específicamente:

1. VEREDICTO — clasifica la relación entre el hilo y el parte oficial:
   - "corroborado": al menos dos personas distintas describen algo consistente con el parte oficial.
   - "ampliado": los vecinos confirman y además aportan datos que el parte no tiene (magnitud, heridos, vías bloqueadas, propagación).
   - "contradictorio": los vecinos describen algo que choca con el parte (dicen que ya se apagó, que no hay nada, que fue en otro lado).
   - "sin_confirmar": nadie aporta información verificable sobre el incidente.
   - "ruido": el hilo es conversación irrelevante, saludos, o bromas.

2. RESUMEN — máximo 30 palabras, en español neutro y claro. Describe la situación según los vecinos. Si el hilo es ruido, dilo sin rodeos. NUNCA inventes detalles que nadie escribió.

3. DATOS NUEVOS — array de strings cortos (máx 12 palabras cada uno) con información concreta que los ciudadanos aportan y el parte oficial NO contiene. Si no hay ninguno, array vacío.

4. CONFIANZA — "alta", "media" o "baja", según cuántas personas distintas coinciden y qué tan específicos son.

CÓMO USAR LA VOTACIÓN
El objeto "votacion" trae tres contadores, uno por persona:
   - confirmo: vecinos que dicen ver el incidente
   - nada: vecinos que dicen no ver nada en ese lugar
   - termino: vecinos que dicen que ya se resolvió

Reglas para interpretarlos:
- Un voto NO es evidencia por sí solo. Un botón no describe nada; el texto sí. El voto solo modula la confianza de lo que ya dice el texto.
- Votos "confirmo" ALTOS + texto con detalles concretos y distintos entre sí (ángulos, calles, cantidades) → sube la confianza.
- Votos "confirmo" ALTOS pero NADIE describe nada concreto → NO subas la confianza. Puede ser gente pulsando porque vio que otros pulsaron. Menciónalo explícitamente en el resumen.
- Mayoría en "nada" o en "termino" contra un parte que sigue "en curso" → veredicto "contradictorio".
- Menos de 3 votos totales: es una muestra demasiado chica. Ignóralos y decide solo por el texto.

REGLAS DURAS
- No inventes. Si el hilo no dice algo, no lo afirmes.
- Un solo mensaje vago nunca es "corroborado".
- Mensajes como "hola", "que pasó", "alguien sabe?" son preguntas, no información.
- Si detectas contradicción, repórtala. No suavices.
- No emitas juicios sobre las personas ni menciones nombres de usuarios.

FORMATO DE SALIDA
Responde ÚNICAMENTE con este objeto JSON, sin texto adicional ni bloques de código:

{
  "veredicto": "corroborado | ampliado | contradictorio | sin_confirmar | ruido",
  "resumen": "string, máx 30 palabras",
  "datos_nuevos": ["string", "string"],
  "confianza": "alta | media | baja",
  "personas": number
}`;

/** Recorta el hilo para no gastar tokens de más ni pasarnos de contexto. */
function prepararHilo(mensajes = []) {
  return mensajes
    .filter((m) => typeof m?.texto === 'string' && m.texto.trim())
    .slice(-40)
    .map((m) => ({
      autor: m.nombre || 'anónimo',
      texto: m.texto.slice(0, 300),
    }));
}

/** Normaliza el conteo de votos que manda el frontend. */
function prepararVotos(votos) {
  const n = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const limpio = {
    confirmo: n(votos?.confirmo),
    nada: n(votos?.nada),
    termino: n(votos?.termino),
  };
  limpio.total = limpio.confirmo + limpio.nada + limpio.termino;
  return limpio;
}

async function analizarHilo({ evento, mensajes, votos }, { apiKey, modelo }) {
  const hilo = prepararHilo(mensajes);
  const votacion = prepararVotos(votos);

  // Sin texto suficiente y sin masa crítica de votos, no vale gastar una llamada
  if (hilo.length < 2 && votacion.total < 3) {
    return {
      veredicto: 'sin_confirmar',
      resumen: 'Todavía no hay suficientes reportes para analizar.',
      datos_nuevos: [],
      confianza: 'baja',
      personas: new Set(hilo.map((m) => m.autor)).size,
      _local: true,
    };
  }

  const entrada = {
    parte_oficial: {
      tipo: evento?.tipo,
      descripcion: evento?.descripcion,
      distrito: evento?.distrito,
      estado: evento?.estado,
      unidades: evento?.detalle_unidades,
      hora: evento?.hora,
    },
    hilo_ciudadano: hilo,
    votacion,
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
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(entrada, null, 2) }],
    }),
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Anthropic ${res.status}: ${texto.slice(0, 200)}`);
  }

  const data = await res.json();
  const texto = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();

  const salida = JSON.parse(texto);

  return {
    veredicto: salida.veredicto ?? 'sin_confirmar',
    resumen: salida.resumen ?? '',
    datos_nuevos: Array.isArray(salida.datos_nuevos) ? salida.datos_nuevos : [],
    confianza: salida.confianza ?? 'baja',
    personas: salida.personas ?? new Set(hilo.map((m) => m.autor)).size,
    mensajes_analizados: hilo.length,
    votos_analizados: votacion.total,
  };
}

module.exports = { analizarHilo, SYSTEM_PROMPT };