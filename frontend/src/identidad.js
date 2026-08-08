const CLAVE_ID = 'radar.dispositivo';
const BACKEND = import.meta.env.VITE_BACKEND_URL;

// Respaldo si localStorage está bloqueado (modo privado estricto).
let idEfimero = null;

/**
 * Identificador estable de este navegador.
 *
 * No es una cuenta ni identifica a una persona. Es lo que permite que Portal
 * nos trate como un usuario con identidad estable en vez de anónimo — que es
 * requisito para que la bandeja de notificaciones funcione: los usuarios
 * anónimos tienen la bandeja permanentemente vacía.
 *
 * Se puede borrar limpiando los datos del navegador.
 */
export function idDispositivo() {
  try {
    let id = localStorage.getItem(CLAVE_ID);
    if (!id) {
      id = generar();
      localStorage.setItem(CLAVE_ID, id);
    }
    return id;
  } catch {
    if (!idEfimero) idEfimero = generar();
    return idEfimero;
  }
}

function generar() {
  const bruto =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  // El backend valida /^[A-Za-z0-9_-]{8,64}$/
  return bruto.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
}

/** El userId con el que Portal nos conoce. Debe coincidir con el backend. */
export function miUserId() {
  return `radar_${idDispositivo()}`;
}

/**
 * Pide un JWT de Portal al backend.
 *
 * Se pasa como callback a PortalProvider, no como string: Portal la vuelve a
 * invocar al conectar, al reconectar y al expirar el token. Un string fijo no
 * se puede refrescar y la conexión terminaría en "blocked" tras dos horas.
 */
export async function pedirToken() {
  const res = await fetch(`${BACKEND}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispositivo: idDispositivo() }),
  });

  if (!res.ok) {
    const detalle = await res.text();
    throw new Error(`No se pudo obtener el token (${res.status}): ${detalle.slice(0, 120)}`);
  }

  const { token } = await res.json();
  if (!token) throw new Error('El backend no devolvió token');
  return token;
}

/**
 * Da de alta (o de baja, con distrito null) los avisos de un distrito.
 * El backend lo guarda en su registro y lo persiste en un canal de Portal.
 */
export async function suscribir(distrito) {
  const res = await fetch(`${BACKEND}/suscribir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: miUserId(), distrito: distrito || null }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`No se pudo registrar el aviso (${res.status}) ${detalle.slice(0, 120)}`);
  }

  return res.json();
}