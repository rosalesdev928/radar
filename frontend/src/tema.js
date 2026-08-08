const CLAVE = 'radar.tema';

/** Capas de CARTO. Ambas son gratuitas y no necesitan clave. */
export const TEMAS = {
  oscuro: {
    nombre: 'Oscuro',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    atribucion: '&copy; OpenStreetMap &copy; CARTO',
  },
  claro: {
    nombre: 'Claro',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    atribucion: '&copy; OpenStreetMap &copy; CARTO',
  },
};

export function leerTema() {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'claro' || t === 'oscuro' ? t : 'oscuro';
  } catch {
    return 'oscuro';
  }
}

export function guardarTema(tema) {
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {}
}