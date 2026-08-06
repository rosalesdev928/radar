export const ABREV = {
  incendio: 'Incendio',
  accidente_vehicular: 'Accidente',
  emergencia_medica: 'Médica',
  materiales_peligrosos: 'Matpel',
  rescate: 'Rescate',
  transito: 'Tránsito',
  otro: 'Otro',
};

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

/** "04/08/2026 12:17:23 p.m." -> { fecha: "4 ago", hora: "12:17 p.m." } */
export function partirFecha(texto = '') {
  const f = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const h = texto.match(/(\d{1,2}:\d{2})(?::\d{2})?\s*(a\.m\.|p\.m\.)?/i);
  return {
    fecha: f ? `${parseInt(f[1], 10)} ${MESES[parseInt(f[2], 10) - 1] ?? ''}` : '',
    hora: h ? `${h[1]}${h[2] ? ' ' + h[2].toLowerCase() : ''}` : texto,
  };
}

export function fechaHora(texto = '') {
  const { fecha, hora } = partirFecha(texto);
  return fecha ? `${fecha} · ${hora}` : hora;
}

/** Convierte el timestamp de Bomberos a un objeto Date real. */
export function aFecha(texto = '') {
  const m = texto.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?\s*(a\.m\.|p\.m\.)?/i
  );
  if (!m) return null;

  let hora = parseInt(m[4], 10);
  const pm = /p\.m\./i.test(m[7] || '');
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

export function haceCuanto(fecha) {
  if (!fecha) return null;
  const s = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (s < 0) return 'ahora';
  if (s < 60) return 'hace segundos';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  const h = Math.floor(s / 3600);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

/** Distancia en km entre dos puntos (Haversine). */
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}