const CLAVE = 'radar.usuario';
const CLAVE_ID = 'radar.dispositivo';

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

/* ---------- Identidad del dispositivo ---------- */

// Respaldo en memoria por si localStorage está bloqueado (modo privado estricto).
// Dura solo lo que dure la pestaña abierta, pero evita que el conteo se rompa.
let idEfimero = null;

/**
 * Identificador estable de este navegador. No es una cuenta ni identifica
 * a una persona: solo sirve para que un mismo dispositivo cuente como un
 * solo voto por evento. Se puede borrar limpiando datos del navegador.
 */
export function idDispositivo() {
  try {
    let id = localStorage.getItem(CLAVE_ID);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(CLAVE_ID, id);
    }
    return id;
  } catch {
    if (!idEfimero) {
      idEfimero = `tmp-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    }
    return idEfimero;
  }
}

/** Detecta si la PWA ya está instalada y corriendo en modo app. */
export function esModoApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}