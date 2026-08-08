const API_BASE = 'https://api.useportal.co/v1';

/**
 * El vigilante.
 *
 * Los demás agentes de Radar reaccionan: alguien pulsa un botón y Claude
 * responde. Este no. Corre solo, mira el conjunto de la ciudad y avisa cuando
 * algo no cuadra — tres incendios en el mismo distrito en media hora no son
 * casualidad, y nadie mirando un mapa de 90 pines se da cuenta.
 *
 * DISEÑO DE COSTO
 * La detección es determinista y gratis: reglas sobre la caché en memoria.
 * Claude solo entra cuando una regla ya disparó, y únicamente para interpretar
 * y redactar. Sin esto, el vigilante llamaría a la API cada pocos minutos para
 * decir "todo normal" y quemaría los créditos en una noche.
 */

const VENTANA_RACIMO_MIN = 45; // minutos para considerar eventos agrupados
const MINIMO_RACIMO = 3; // cuántos hacen falta para que sea patrón
const FACTOR_VOLUMEN = 2.2; // cuánto sobre el promedio horario es anómalo
const MINIMO_PARA_VOLUMEN = 6; // por debajo de esto el promedio no dice nada

/** "04/08/2026 12:17:23 p.m." -> Date. Devuelve null si no se puede leer. */
function aFecha(texto = '') {
  const m = String(texto).match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i
  );
  if (!m) return null;

  let hora = parseInt(m[4], 10);
  const pm = /p/i.test((m[7] || '').replace(/[.\s]/g, '').charAt(0) || '');
  if (pm && hora !== 12) hora += 12;
  if (!pm && hora === 12) hora = 0;

  return new Date(
    parseInt(m[3], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[1], 10),
    hora,
    parseInt(m[5], 10),
    parseInt(m[6] || '0', 10)
  );
}

function minutosEntre(a, b) {
  return Math.abs(a - b) / 60000;
}

/* ------------------------------------------------------------------ *
 * Detección — determinista, sin IA
 * ------------------------------------------------------------------ */

/**
 * Busca concentraciones: varios eventos del mismo tipo, en el mismo distrito,
 * dentro de una ventana corta.
 *
 * Deslizamos la ventana en vez de cortar por hora de reloj: tres incendios a
 * las 11:50, 12:05 y 12:20 son un racimo aunque caigan en horas distintas.
 */
function buscarRacimos(eventos, ahora) {
  const porGrupo = new Map();

  for (const e of eventos) {
    const cuando = aFecha(e.hora);
    if (!cuando) continue;
    // Solo el pasado reciente: lo de hace seis horas ya no es actualidad
    if (minutosEntre(ahora, cuando) > 180) continue;

    const clave = `${e.distrito}|${e.tipo}`;
    if (!porGrupo.has(clave)) porGrupo.set(clave, []);
    porGrupo.get(clave).push({ ...e, cuando });
  }

  const racimos = [];

  for (const [clave, lista] of porGrupo) {
    if (lista.length < MINIMO_RACIMO) continue;
    lista.sort((a, b) => a.cuando - b.cuando);

    // Ventana deslizante: dos punteros sobre la lista ordenada
    let i = 0;
    for (let j = 0; j < lista.length; j++) {
      while (minutosEntre(lista[j].cuando, lista[i].cuando) > VENTANA_RACIMO_MIN) i++;
      const dentro = j - i + 1;

      if (dentro >= MINIMO_RACIMO) {
        const grupo = lista.slice(i, j + 1);
        const [distrito, tipo] = clave.split('|');
        racimos.push({
          clase: 'racimo',
          distrito,
          tipo,
          cantidad: dentro,
          minutos: Math.round(minutosEntre(grupo[grupo.length - 1].cuando, grupo[0].cuando)),
          eventos: grupo.map((e) => ({
            id: e.id,
            descripcion: e.descripcion,
            hora: e.hora,
            relevancia: e.relevancia,
          })),
        });
        break; // un racimo por grupo basta; no queremos veinte variantes
      }
    }
  }

  return racimos;
}

/** ¿La última hora tuvo mucho más movimiento que el resto del día? */
function buscarVolumenAnomalo(eventos, ahora) {
  const conFecha = eventos
    .map((e) => ({ ...e, cuando: aFecha(e.hora) }))
    .filter((e) => e.cuando);

  if (conFecha.length < MINIMO_PARA_VOLUMEN * 3) return null;

  const ultimaHora = conFecha.filter((e) => minutosEntre(ahora, e.cuando) <= 60);
  if (ultimaHora.length < MINIMO_PARA_VOLUMEN) return null;

  const masViejo = conFecha.reduce((min, e) => (e.cuando < min ? e.cuando : min), ahora);
  const horasCubiertas = Math.max(1, minutosEntre(ahora, masViejo) / 60);
  const promedio = conFecha.length / horasCubiertas;

  if (ultimaHora.length < promedio * FACTOR_VOLUMEN) return null;

  const porDistrito = ultimaHora.reduce((m, e) => {
    m[e.distrito] = (m[e.distrito] || 0) + 1;
    return m;
  }, {});

  return {
    clase: 'volumen',
    cantidad: ultimaHora.length,
    promedio: Number(promedio.toFixed(1)),
    porDistrito,
    tipos: [...new Set(ultimaHora.map((e) => e.tipo))].slice(0, 6),
  };
}

/* ------------------------------------------------------------------ *
 * Interpretación — aquí sí entra Claude
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `Eres el vigilante de Radar, un mapa de emergencias en tiempo real de Lima Metropolitana, Perú.

Un sistema de reglas ya detectó un patrón en los partes del Cuerpo General de Bomberos. Tu trabajo NO es detectarlo: es decidir si merece que la gente lo sepa, y decirlo en una frase.

CRITERIO
Pregúntate si un vecino de esa zona cambiaría algo de lo que va a hacer al leerlo. Si la respuesta es no, descártalo.

- Tres emergencias médicas dispersas en un distrito grande a lo largo de 40 minutos es ruido estadístico en una ciudad de 10 millones. Descártalo.
- Tres incendios en el mismo distrito en media hora sí importa: puede haber una causa común (corte eléctrico, viento, quema de basura).
- Un pico de volumen concentrado en un solo distrito importa. Repartido por toda Lima, probablemente sea la hora punta y no un evento.

REGLAS DURAS
- No inventes causas. Puedes señalar que un patrón "podría" tener causa común, nunca afirmar cuál es.
- No alarmes. Esto lo lee gente que puede estar cerca. Tono informativo, nunca dramático.
- No repitas los datos crudos que ya se ven en el mapa; aporta la lectura.
- Nunca sugieras evacuar, ni des instrucciones de emergencia. Solo Bomberos y Defensa Civil pueden hacer eso.
- Si descartas, no expliques largo: basta el motivo en pocas palabras.

FORMATO
Responde ÚNICAMENTE con este JSON, sin texto adicional ni bloques de código:

{
  "publicar": true | false,
  "motivo": "string, máx 12 palabras, por qué publicas o descartas",
  "titulo": "string, máx 8 palabras",
  "detalle": "string, máx 30 palabras, la lectura del patrón",
  "nivel": "informativo | atencion"
}

Usa "atencion" solo si el patrón sugiere un riesgo activo para quien esté en esa zona ahora. En duda, "informativo".`;

async function interpretar(hallazgo, { apiKey, modelo }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(hallazgo, null, 2) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }

  const data = await res.json();
  const texto = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();

  return JSON.parse(texto);
}

/* ------------------------------------------------------------------ *
 * El vigilante
 * ------------------------------------------------------------------ */

class Vigilante {
  constructor({ secretKey, canal, ia, cadaCiclos = 10 }) {
    this.secretKey = secretKey;
    this.canal = canal;
    this.ia = ia;
    this.cadaCiclos = cadaCiclos;

    this.ciclosDesdeUltimo = 0;
    // Firma de lo ya publicado, para no repetir el mismo aviso cada revisión
    this.yaAvisado = new Map();
    this.stats = { revisiones: 0, hallazgos: 0, publicados: 0, descartados: 0 };
  }

  /** Identifica un hallazgo para no volver a publicarlo si no cambió. */
  firma(h) {
    return h.clase === 'racimo'
      ? `racimo:${h.distrito}:${h.tipo}:${h.cantidad}`
      : `volumen:${h.cantidad}`;
  }

  /** Un aviso caduca a los 90 minutos: pasado eso, si sigue, vuelve a contar. */
  esNuevo(h) {
    const f = this.firma(h);
    const visto = this.yaAvisado.get(f);
    if (visto && Date.now() - visto < 90 * 60000) return false;
    this.yaAvisado.set(f, Date.now());
    return true;
  }

  async publicar(aviso) {
    try {
      const res = await fetch(`${API_BASE}/channels/${this.canal}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ senderId: 'radar-vigilante', content: aviso }),
      });
      if (!res.ok) {
        console.error(`[vigilante] ✗ publicar ${res.status}`);
        return false;
      }
      return true;
    } catch (e) {
      console.error(`[vigilante] ✗ red: ${e.message}`);
      return false;
    }
  }

  /**
   * Se llama en cada ciclo del scraper, pero solo trabaja de vez en cuando:
   * revisar cada 30 segundos no aporta nada, los patrones tardan en formarse.
   */
  async revisar(eventos) {
    if (++this.ciclosDesdeUltimo < this.cadaCiclos) return null;
    this.ciclosDesdeUltimo = 0;
    this.stats.revisiones++;

    if (!this.ia?.aiEnabled || !this.ia?.apiKey) return null;

    const ahora = new Date();
    const hallazgos = [
      ...buscarRacimos(eventos, ahora),
      buscarVolumenAnomalo(eventos, ahora),
    ].filter(Boolean);

    if (!hallazgos.length) return null;

    // Solo lo que no hayamos avisado ya, y como mucho dos por revisión:
    // si publicáramos cinco de golpe, la gente dejaría de leerlos.
    const nuevos = hallazgos.filter((h) => this.esNuevo(h)).slice(0, 2);
    if (!nuevos.length) return null;

    this.stats.hallazgos += nuevos.length;
    const publicados = [];

    for (const h of nuevos) {
      try {
        const lectura = await interpretar(h, this.ia);

        if (!lectura.publicar) {
          this.stats.descartados++;
          console.log(`[vigilante] descartado: ${lectura.motivo}`);
          continue;
        }

        const aviso = {
          tipo: 'vigilante',
          clase: h.clase,
          nivel: lectura.nivel === 'atencion' ? 'atencion' : 'informativo',
          titulo: lectura.titulo,
          detalle: lectura.detalle,
          distrito: h.distrito ?? null,
          cantidad: h.cantidad,
          eventos: h.eventos?.map((e) => e.id) ?? [],
          ts: Date.now(),
        };

        if (await this.publicar(aviso)) {
          this.stats.publicados++;
          publicados.push(aviso);
          console.log(`[vigilante] ▲ ${aviso.titulo} (${aviso.nivel})`);
        }
      } catch (e) {
        console.error(`[vigilante] ✗ interpretar: ${e.message}`);
      }
    }

    return publicados.length ? publicados : null;
  }

  estadisticas() {
    return { ...this.stats };
  }
}

module.exports = { Vigilante, buscarRacimos, buscarVolumenAnomalo, aFecha };