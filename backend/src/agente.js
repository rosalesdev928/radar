const { calcularRelevancia, contarUnidades, explicarRelevancia } = require('./severidad');

const SYSTEM_PROMPT = `Eres el agente de verificación cruzada de Radar, un mapa de emergencias en tiempo real para Lima Metropolitana, Perú.

CONTEXTO
Recibirás una lista de eventos crudos provenientes de fuentes oficiales ya confiables por naturaleza:
- Bomberos Perú (incendios, rescates, emergencias médicas, materiales peligrosos)
- PNP (seguridad, accidentes, emergencias)
- ATU / Tráfico RPP (desvíos, cierres de vías, tránsito)

IMPORTANTE: todas estas fuentes son oficiales y confiables de por sí. Tu trabajo NO es decidir si algo es verdadero o falso — eso ya está dado. Tu trabajo es traducir el evento a lenguaje claro y detectar cuándo varias fuentes hablan del mismo tema.

TAREA
Para cada evento que recibas:

1. Identifica si dos o más fuentes distintas se refieren al mismo tema (mismo tipo de incidente y misma zona/distrito). La coincidencia es FLEXIBLE: no exijas misma hora exacta ni misma dirección exacta, basta con que el tema y la zona coincidan razonablemente.

2. Genera una descripción en lenguaje natural y corta (máximo 15 palabras) a partir de la categoría técnica cruda, pensada para que la entienda cualquier vecino. Ejemplo: "INCENDIO / ESTRUCTURAS / VIVIENDA / MATERIAL NOBLE" se convierte en "Incendio en vivienda de material noble".

3. Si el evento no trae coordenadas válidas (0,0), indícalo en el campo "coordenadas_validas": false.

4. Conserva el distrito EXACTAMENTE como viene en el evento de entrada. No lo cambies, no lo inventes, no descartes eventos por su distrito.

5. NO calcules el campo "relevancia": el sistema lo determina aparte según las unidades movilizadas. Devuélvelo siempre como "media".

FORMATO DE SALIDA
Responde ÚNICAMENTE con un array JSON, sin texto adicional, con esta estructura por cada evento:

[
  {
    "id": "string, usa el N° de parte del evento",
    "tipo": "string corto, uno de: incendio, accidente_vehicular, emergencia_medica, materiales_peligrosos, rescate, transito, otro",
    "descripcion": "string en lenguaje natural, máx 15 palabras",
    "distrito": "string, el distrito tal como vino en la entrada",
    "lat": number,
    "lon": number,
    "coordenadas_validas": boolean,
    "estado": "atendiendo | cerrado",
    "relevancia": "media",
    "fuentes": ["array de strings con el nombre de cada fuente que reportó este tema"],
    "hora": "string, timestamp original del evento"
  }
]

Si no hay eventos en este batch, responde con un array vacío: []`;

/**
 * Modo bypass: normaliza los eventos sin llamar a la API.
 * Permite que el pipeline completo funcione sin créditos.
 */
function clasificarSinIA(eventos) {
  return eventos.map((e) => ({
    id: e.id,
    tipo: inferirTipo(e.tipo),
    descripcion: simplificarDescripcion(e.tipo),
    distrito: e.distrito,
    lat: e.lat,
    lon: e.lon,
    coordenadas_validas: e.coordenadas_validas,
    estado: e.estado === 'ATENDIENDO' ? 'atendiendo' : 'cerrado',
    relevancia: calcularRelevancia(e),
    unidades: contarUnidades(e.maquinas),
    detalle_unidades: explicarRelevancia(e),
    fuentes: [e.fuente],
    hora: e.fecha,
    _bypass: true,
  }));
}

function inferirTipo(tipoCrudo = '') {
  const t = tipoCrudo.toUpperCase();
  if (t.includes('INCENDIO')) return 'incendio';
  if (t.includes('ACCIDENTE')) return 'accidente_vehicular';
  if (t.includes('MEDICA')) return 'emergencia_medica';
  if (t.includes('MATERIALES PELIGROSOS')) return 'materiales_peligrosos';
  if (t.includes('RESCATE')) return 'rescate';
  return 'otro';
}

function simplificarDescripcion(tipoCrudo = '') {
  const partes = tipoCrudo.split('/').map((p) => p.trim().toLowerCase());
  const texto = partes.slice(0, 3).join(', ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Llama a la API de Claude para clasificar el lote.
 * La relevancia se recalcula en el backend a partir de las unidades
 * movilizadas, porque es un dato objetivo del parte oficial.
 */
async function clasificarConIA(eventos, { apiKey, modelo }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(eventos, null, 2),
        },
      ],
    }),
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Anthropic ${res.status}: ${texto.slice(0, 300)}`);
  }

  const data = await res.json();
  const texto = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();

  const clasificados = JSON.parse(texto);
  const porId = new Map(eventos.map((e) => [String(e.id), e]));

  return clasificados.map((c) => {
    const original = porId.get(String(c.id));
    if (!original) return c;
    return {
      ...c,
      relevancia: calcularRelevancia(original),
      unidades: contarUnidades(original.maquinas),
      detalle_unidades: explicarRelevancia(original),
    };
  });
}

/**
 * Punto de entrada. Si la IA falla, cae al bypass en vez de romper el pipeline.
 */
async function clasificar(eventos, config) {
  if (!eventos.length) return [];

  if (!config.aiEnabled || !config.apiKey) {
    return clasificarSinIA(eventos);
  }

  try {
    return await clasificarConIA(eventos, config);
  } catch (err) {
    console.error(`  ⚠ IA falló (${err.message}). Usando bypass.`);
    return clasificarSinIA(eventos);
  }
}

module.exports = { clasificar, clasificarSinIA, SYSTEM_PROMPT };