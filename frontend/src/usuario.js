const CLAVE = 'radar.usuario';

export function leerUsuario() {
  try {
    return localStorage.getItem(CLAVE) || null;
  } catch {
    return null;
  }
}

export function guardarUsuario(nombre) {
  try {
    localStorage.setItem(CLAVE, nombre);
  } catch {}
}

export function borrarUsuario() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {}
}

/** Detecta si la PWA ya está instalada y corriendo en modo app. */
export function esModoApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}