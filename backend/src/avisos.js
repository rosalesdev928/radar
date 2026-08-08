const API_BASE = 'https://api.useportal.co/v1';

/**
 * Envío de avisos a la bandeja de Portal.
 *
 * Importante sobre el alcance real de esto (v1 de la API):
 *   "Delivers a notification to a single user as an inbox item, with a live
 *    push if the user is currently connected. No batching and no external
 *    destinations in v1 — delivery is to the Portal inbox only."
 *
 * O sea: NO es una notificación del sistema operativo con la app cerrada.
 * Es un ítem persistente en la bandeja del usuario, entregado en vivo si
 * está conectado. El globo del sistema lo dispara el frontend cuando el
 * hook useInbox detecta el ítem nuevo.
 *
 * Tampoco hay envío por lotes: es una llamada HTTP por usuario. Por eso
 * limitamos el abanico y espaciamos los envíos.
 */
class Avisador {
  constructor({ secretKey, maxPorEvento = 200, pausaMs = 40 }) {
    if (!secretKey) throw new Error('Falta PORTAL_SECRET');
    this.secretKey = secretKey;
    this.maxPorEvento = maxPorEvento;
    this.pausaMs = pausaMs;
    this.enviados = 0;
    this.fallidos = 0;
  }

  /**
   * Manda un aviso a un usuario.
   *
   * La idempotency-key hace que reintentar el mismo evento para el mismo
   * usuario no duplique el ítem: la API devuelve el mismo id y lo crea una
   * sola vez. Eso nos cubre si un ciclo del scraper reprocesa un parte.
   */
  async avisar(userId, evento) {
    const cuerpo = {
      type: 'radar.emergencia',
      title: `${etiqueta(evento.tipo)} en ${evento.distrito}`,
      data: {
        id: evento.id,
        tipo: evento.tipo,
        distrito: evento.distrito,
        descripcion: evento.descripcion,
        relevancia: evento.relevancia,
        estado: evento.estado,
        lat: evento.lat ?? null,
        lng: evento.lng ?? null,
        hora: evento.hora,
      },
    };

    try {
      const res = await fetch(`${API_BASE}/users/${userId}/notifications`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          'idempotency-key': `radar-${evento.id}-${userId}`,
        },
        body: JSON.stringify(cuerpo),
      });

      if (!res.ok) {
        const texto = await res.text();
        console.error(
          `  ✗ aviso a ${userId.slice(0, 12)}… → ${res.status}: ${texto.slice(0, 120)}`
        );
        this.fallidos++;
        return false;
      }

      this.enviados++;
      return true;
    } catch (err) {
      console.error(`  ✗ red al avisar: ${err.message}`);
      this.fallidos++;
      return false;
    }
  }

  /**
   * Avisa a todos los suscriptores del distrito de un evento.
   * Devuelve cuántos avisos salieron bien.
   */
  async avisarDelEvento(evento, registro) {
    const usuarios = registro.usuariosDe(evento.distrito);
    if (!usuarios.length) return 0;

    const destinatarios = usuarios.slice(0, this.maxPorEvento);
    if (usuarios.length > destinatarios.length) {
      console.warn(
        `[avisos] ${evento.distrito}: ${usuarios.length} suscriptores, ` +
          `avisando solo a ${destinatarios.length}`
      );
    }

    let ok = 0;
    for (const userId of destinatarios) {
      if (await this.avisar(userId, evento)) ok++;
      await new Promise((r) => setTimeout(r, this.pausaMs));
    }

    return ok;
  }

  estadisticas() {
    return { enviados: this.enviados, fallidos: this.fallidos };
  }
}

const ETIQUETAS = {
  incendio: 'Incendio',
  medica: 'Emergencia médica',
  accidente: 'Accidente',
  rescate: 'Rescate',
  matpel: 'Materiales peligrosos',
  otro: 'Emergencia',
};

function etiqueta(tipo) {
  return ETIQUETAS[tipo] ?? ETIQUETAS.otro;
}

module.exports = { Avisador };