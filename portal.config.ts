import { defineConfig, defineMiddleware, allow, block, mask } from '@portalsdk/config';

/**
 * Configuración de Portal para Radar.
 *
 * Se despliega aparte del backend, con `portal deploy`. Todo lo que hay aquí
 * corre en el borde de Portal, antes de que un mensaje llegue a nadie — o sea
 * que un cliente modificado tampoco puede saltárselo. Esa es la diferencia
 * con filtrar en el frontend.
 */

interface MensajeRadar {
  texto?: string;
  nombre?: string | null;
  voto?: string;
  dispositivo?: string;
}

const LARGO_MAXIMO = 240;

/* ------------------------------------------------------------------ *
 * Normalización
 *
 * Filtrar por coincidencia literal no sirve: la gente escribe "M13RD@",
 * "puuuta", "MIÉRDA". Antes de comparar, aplanamos el texto a una forma
 * canónica. El mensaje original no se toca; esto es solo para decidir.
 * ------------------------------------------------------------------ */

const SUSTITUCIONES: Record<string, string> = {
  '@': 'a', '4': 'a',
  '3': 'e',
  '1': 'i', '!': 'i', '|': 'i',
  '0': 'o',
  '5': 's', $: 's',
  '7': 't',
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tildes
    .replace(/[@43105!|$7]/g, (c) => SUSTITUCIONES[c] ?? c);
}

/**
 * Lista base. Deliberadamente corta: cada entrada de más es una posibilidad
 * de falso positivo, y censurar de más en una app de emergencias es peor que
 * dejar pasar un insulto suelto. Se comparan con límite de palabra para no
 * romper palabras legítimas que las contienen.
 */
const PALABRAS = [
  'ctm', 'csm', 'conchatumare', 'conchasumare', 'concha tu madre',
  'mierda', 'puta', 'puto', 'putas', 'putos',
  'cojudo', 'cojuda', 'huevon', 'huevona', 'pendejo', 'pendeja',
  'imbecil', 'idiota', 'estupido', 'estupida',
  'maricon', 'cabro', 'zorra', 'perra',
  'carajo', 'mrd',
];

/**
 * "puuuuta" y "putaaa" son la misma palabra estirada. Aplanar las letras
 * repetidas del texto sería lo obvio, pero rompe palabras legítimas: "perra"
 * se convertiría en "pera" y filtraríamos fruta.
 *
 * En vez de eso dejamos el texto intacto y hacemos que el patrón tolere la
 * repetición: cada letra pasa a aceptar una o más apariciones.
 */
function elastico(palabra: string): string {
  return palabra
    .split('')
    .map((c) => {
      if (c === ' ') return '\\s+';
      return `${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}+`;
    })
    .join('');
}

const PATRON = new RegExp(
  `(?<![a-z0-9])(${PALABRAS.map(elastico).join('|')})(?![a-z0-9])`,
  'gi'
);

function tieneLisuras(texto: string): boolean {
  PATRON.lastIndex = 0;
  return PATRON.test(normalizar(texto));
}

/**
 * Censura sobre el texto ORIGINAL, no sobre el normalizado: hay que devolver
 * algo legible. Recorremos el normalizado para saber dónde están los tramos
 * ofensivos y tapamos esas mismas posiciones en el original — la
 * normalización conserva la longitud, salvo el colapso de repeticiones, así
 * que ante la duda tapamos de más y no de menos.
 */
function censurar(texto: string): string {
  const plano = normalizar(texto);

  // `plano` y `texto` miden lo mismo: la normalización sustituye caracteres
  // uno a uno y no colapsa nada, así que los índices coinciden exactamente.
  let salida = texto;
  PATRON.lastIndex = 0;

  for (const m of plano.matchAll(PATRON)) {
    const i = m.index ?? 0;
    salida = salida.slice(0, i) + '•'.repeat(m[0].length) + salida.slice(i + m[0].length);
  }

  return salida;
}

/* ------------------------------------------------------------------ *
 * Middleware
 * ------------------------------------------------------------------ */

const moderar = defineMiddleware<MensajeRadar>('publish', (ctx) => {
  if (!ctx.capabilities.publish) {
    return block('No puedes escribir en este hilo.');
  }

  const contenido = ctx.message.content;

  // Los votos y otras señales no llevan texto: pasan sin revisar.
  if (typeof contenido?.texto !== 'string') return allow();

  const texto = contenido.texto.trim();

  if (!texto) {
    return block('El mensaje está vacío.');
  }

  if (texto.length > LARGO_MAXIMO) {
    return block(`Máximo ${LARGO_MAXIMO} caracteres. Sé breve: esto es una emergencia.`);
  }

  // Enlaces: en un hilo de emergencia solo sirven para colar spam o estafas.
  if (/(https?:\/\/|www\.)/i.test(texto)) {
    return block('No se permiten enlaces en los reportes.');
  }

  if (tieneLisuras(texto)) {
    // Enmascaramos en vez de bloquear: el reporte puede ser útil aunque venga
    // con un insulto de por medio, y perderlo entero sería peor.
    return mask<MensajeRadar>({ ...contenido, texto: censurar(texto) });
  }

  return allow();
});

export default defineConfig({
  channels: {
    // Hilos ciudadanos por evento: aquí escribe cualquiera, así que aquí se
    // modera.
    'radar:chat:*': {
      anonymous: true,
      onPublish: [moderar],
    },

    // Registro de suscripciones: solo escribe el backend con la secret key
    // (los server publish no pasan por este middleware).
    'radar:suscripciones': {
      anonymous: true,
    },
  },
});