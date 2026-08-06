/** Lima Metropolitana — 43 distritos. */
const LIMA_METROPOLITANA = [
  'ANCON', 'ATE', 'BARRANCO', 'BREÑA', 'CARABAYLLO', 'CHACLACAYO',
  'CHORRILLOS', 'CIENEGUILLA', 'COMAS', 'EL AGUSTINO', 'INDEPENDENCIA',
  'JESUS MARIA', 'LA MOLINA', 'LA VICTORIA', 'LIMA', 'LINCE', 'LOS OLIVOS',
  'LURIGANCHO', 'LURIN', 'MAGDALENA DEL MAR', 'MIRAFLORES', 'PACHACAMAC',
  'PUCUSANA', 'PUEBLO LIBRE', 'PUENTE PIEDRA', 'PUNTA HERMOSA',
  'PUNTA NEGRA', 'RIMAC', 'SAN BARTOLO', 'SAN BORJA', 'SAN ISIDRO',
  'SAN JUAN DE LURIGANCHO', 'SAN JUAN DE MIRAFLORES', 'SAN LUIS',
  'SAN MARTIN DE PORRES', 'SAN MIGUEL', 'SANTA ANITA',
  'SANTA MARIA DEL MAR', 'SANTA ROSA', 'SANTIAGO DE SURCO', 'SURQUILLO',
  'VILLA EL SALVADOR', 'VILLA MARIA DEL TRIUNFO',
];

/** Quita tildes y normaliza para comparar sin sorpresas. */
function normalizar(texto = '') {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const SET_LIMA = new Set(LIMA_METROPOLITANA.map(normalizar));

function esDeLima(distrito) {
  return SET_LIMA.has(normalizar(distrito));
}

/** 'SAN JUAN DE LURIGANCHO' -> 'san-juan-de-lurigancho' */
function slug(distrito) {
  return normalizar(distrito).toLowerCase().replace(/\s+/g, '-');
}

module.exports = { LIMA_METROPOLITANA, esDeLima, normalizar, slug };