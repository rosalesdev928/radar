const cheerio = require('cheerio');

const URL_BOMBEROS = 'https://sgonorte.bomberosperu.gob.pe/24horas';
const DISTRITO_OBJETIVO = 'LA VICTORIA';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-PE,es;q=0.9',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
};

function extraerCoordenadas(texto) {
  const match = texto.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

function extraerDistrito(texto) {
  const partes = texto.split(' - ');
  if (partes.length < 2) return null;
  return partes[partes.length - 1].trim().toUpperCase();
}

function limpiarDireccion(texto) {
  return texto
    .replace(/\(-?\d+\.?\d*,\s*-?\d+\.?\d*\)/, '')
    .replace(/Nro\.\s*\d*/, '')
    .split(' - ')
    .slice(0, -1)
    .join(' - ')
    .replace(/\s+/g, ' ')
    .trim();
}
async function obtenerHTML() {
  const url = `${URL_BOMBEROS}?_=${Date.now()}`;
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`Bomberos respondió ${res.status}`);
  return await res.text();
}

/**
 * Parsea la tabla buscando la fila por su CONTENIDO, no por posición fija.
 * El N° de parte es un número de 10 dígitos que empieza con el año.
 */
function parsearEmergencias(html) {
  const $ = cheerio.load(html);
  const eventos = [];

  $('tr').each((_, fila) => {
    const celdas = $(fila).find('td');
    if (celdas.length < 6) return;

    // Buscamos dinámicamente en qué celda está el N° de parte
    let idxParte = -1;
    celdas.each((i, c) => {
      if (idxParte === -1 && /^\d{9,12}$/.test($(c).text().trim())) idxParte = i;
    });
    if (idxParte === -1) return;

    const textos = celdas.map((_, c) => $(c).text().replace(/\s+/g, ' ').trim()).get();

    const nroParte = textos[idxParte];
    const fecha = textos[idxParte + 1] || '';
    const direccionRaw = textos[idxParte + 2] || '';
    const tipo = textos[idxParte + 3] || '';
    const estado = (textos[idxParte + 4] || '').toUpperCase();
    const maquinas = textos[idxParte + 5] || '';

    const coords = extraerCoordenadas(direccionRaw);

    eventos.push({
      id: nroParte,
      fecha,
      direccion: limpiarDireccion(direccionRaw),
      direccionRaw,
      distrito: extraerDistrito(direccionRaw),
      tipo,
      estado,
      maquinas,
      lat: coords ? coords.lat : 0,
      lon: coords ? coords.lon : 0,
      coordenadas_validas: coords !== null,
      fuente: 'Bomberos Perú',
    });
  });

  return eventos;
}

function filtrarPorDistrito(eventos, distrito = DISTRITO_OBJETIVO) {
  return eventos.filter((e) => e.distrito === distrito);
}

async function scrapearBomberos() {
  const html = await obtenerHTML();
  const todos = parsearEmergencias(html);
  return { todos, filtrados: filtrarPorDistrito(todos) };
}

module.exports = {
  scrapearBomberos,
  parsearEmergencias,
  filtrarPorDistrito,
  extraerCoordenadas,
  extraerDistrito,
};