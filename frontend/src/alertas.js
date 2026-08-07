/** Lima Metropolitana — 43 distritos. Mismo listado que usa el backend. */
export const DISTRITOS = [
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

const CLAVE_DISTRITO = 'radar.distrito';
const CLAVE_ALERTAS = 'radar.alertas';

/** Quita tildes y normaliza para comparar sin sorpresas. */
export function normalizar(texto = '') {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- Preferencias ---------- */

export function leerDistrito() {
  try {
    return localStorage.getItem(CLAVE_DISTRITO) || null;
  } catch {
    return null;
  }
}

export function guardarDistrito(distrito) {
  try {
    if (distrito) localStorage.setItem(CLAVE_DISTRITO, distrito);
    else localStorage.removeItem(CLAVE_DISTRITO);
  } catch {}
}

export function leerAlertas() {
  try {
    return localStorage.getItem(CLAVE_ALERTAS) === 'true';
  } catch {
    return false;
  }
}

export function guardarAlertas(activas) {
  try {
    localStorage.setItem(CLAVE_ALERTAS, activas ? 'true' : 'false');
  } catch {}
}

/* ---------- Permisos del navegador ---------- */

export function soportaNotificaciones() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 'granted' | 'denied' | 'default' | 'no-soportado' */
export function estadoPermiso() {
  if (!soportaNotificaciones()) return 'no-soportado';
  return Notification.permission;
}

/**
 * Pide permiso al navegador. Solo se puede llamar desde un gesto del
 * usuario (un clic), nunca al cargar la página: los navegadores
 * bloquean las peticiones automáticas.
 */
export async function pedirPermiso() {
  if (!soportaNotificaciones()) return 'no-soportado';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/* ---------- Envío ---------- */

/**
 * Muestra una notificación del sistema operativo.
 *
 * Preferimos el service worker porque en Android Chrome el constructor
 * `new Notification()` lanza excepción. El constructor queda de respaldo
 * para escritorio cuando aún no hay SW registrado.
 *
 * Importante: esto solo funciona con la app abierta o en segundo plano.
 * Con la PWA cerrada del todo haría falta Web Push con VAPID.
 */
export async function notificar({ titulo, cuerpo, tag }) {
  if (!soportaNotificaciones() || Notification.permission !== 'granted') {
    return false;
  }

  const opciones = {
    body: cuerpo,
    tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    lang: 'es-PE',
  };

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(titulo, opciones);
      return true;
    }
    new Notification(titulo, opciones);
    return true;
  } catch {
    return false;
  }
}