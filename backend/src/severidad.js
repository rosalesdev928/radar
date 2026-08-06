/**
 * Calcula la gravedad de una emergencia a partir de datos objetivos
 * del parte oficial: tipo de incidente y unidades movilizadas.
 *
 * Bomberos moviliza según protocolo — más unidades significa
 * mayor gravedad evaluada por el despacho, no por nosotros.
 */

// Palabras del campo "tipo" que indican riesgo elevado
const CRITICAS = [
  'ESTRUCTURAS',
  'MATERIAL NOBLE',
  'MATERIALES PELIGROSOS',
  'EXPLOSION',
  'DERRUMBE',
  'ATRAPADO',
  'RESCATE',
  'PARO CARDIACO',
  'PARO RESPIRATORIO',
  'INCONSCIENTE',
  'TIEMPO-VIDA',
  'ARMA DE FUEGO',
  'ATROPELLO',
  'VOLCADURA',
  'DESPISTE',
];

/** Cuenta las unidades del campo "M202-1 RESLIG-36 M36-1" */
function contarUnidades(maquinas = '') {
  const limpio = (maquinas || '').trim();
  if (!limpio) return 0;
  return limpio.split(/[\s,]+/).filter(Boolean).length;
}

/**
 * Devuelve: 'alta' | 'media' | 'baja'
 */
function calcularRelevancia(evento) {
  const unidades = contarUnidades(evento.maquinas);
  const tipo = (evento.tipo || '').toUpperCase();
  const activo = evento.estado === 'ATENDIENDO' || evento.estado === 'atendiendo';

  const esCritica = CRITICAS.some((p) => tipo.includes(p));

  // 3+ unidades: el despacho lo escaló, es grave
  if (unidades >= 3) return 'alta';

  // 2 unidades sobre un tipo crítico
  if (unidades >= 2 && esCritica) return 'alta';

  // Tipo crítico en curso, aunque haya poca movilización
  if (esCritica && activo) return 'alta';

  if (unidades >= 2 || esCritica) return 'media';

  return 'baja';
}

/** Texto explicativo para mostrar en la app */
function explicarRelevancia(evento) {
  const n = contarUnidades(evento.maquinas);
  if (n === 0) return 'Sin unidades registradas en el parte';
  if (n === 1) return '1 unidad movilizada';
  return `${n} unidades movilizadas`;
}

module.exports = { calcularRelevancia, contarUnidades, explicarRelevancia };