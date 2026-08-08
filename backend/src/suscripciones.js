const { normalizar } = require('./distritos');

const API_BASE = 'https://api.useportal.co/v1';

/**
 * Registro de "qué usuario quiere avisos de qué distrito".
 *
 * No hay base de datos. Usamos un canal de Portal como bitácora persistente:
 * el frontend publica {userId, distrito} cada vez que alguien cambia su
 * preferencia, y aquí reducimos ese log a un Map en memoria.
 *
 * Un canal es un log de append, no una tabla: si alguien cambia de distrito
 * tres veces quedan tres mensajes y gana el último. Por eso recorremos el
 * historial en orden y sobreescribimos.
 *
 * En caliente trabajamos contra el Map (rápido). En frío, tras un reinicio
 * de Render, lo reconstruimos leyendo el historial (persistente).
 */
class RegistroDeSuscripciones {
  constructor({ secretKey, canal = 'radar:suscripciones' }) {
    if (!secretKey) throw new Error('Falta PORTAL_SECRET');
    this.secretKey = secretKey;
    this.canal = canal;

    this.porUsuario = new Map(); // userId -> DISTRITO normalizado
    this.ultimoSeq = 0;
    this.cargado = false;
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Aplica un mensaje del canal al Map. Formato esperado del contenido:
   *   { userId: 'anon_...', distrito: 'COMAS' }   -> suscribe
   *   { userId: 'anon_...', distrito: null }      -> da de baja
   */
  aplicar(msg) {
    const c = msg?.content;
    if (!c?.userId) return false;

    if (c.distrito) {
      this.porUsuario.set(c.userId, normalizar(c.distrito));
    } else {
      this.porUsuario.delete(c.userId);
    }

    if (typeof msg.seq === 'number' && msg.seq > this.ultimoSeq) {
      this.ultimoSeq = msg.seq;
    }
    return true;
  }

  /**
   * Reconstruye el Map leyendo el historial del canal.
   *
   * El endpoint pagina hacia atrás (`before` + `limit`, máximo 100), así que
   * recogemos páginas desde la más nueva hacia atrás y luego aplicamos todo
   * en orden cronológico para que el último mensaje de cada usuario gane.
   */
  async cargar({ maxPaginas = 20 } = {}) {
    const paginas = [];
    let before;

    try {
      for (let i = 0; i < maxPaginas; i++) {
        const params = new URLSearchParams({ limit: '100' });
        if (before !== undefined) params.set('before', String(before));

        const res = await fetch(
          `${API_BASE}/channels/${this.canal}/history?${params}`,
          { headers: this.headers }
        );

        if (!res.ok) {
          const texto = await res.text();
          throw new Error(`historial ${res.status}: ${texto.slice(0, 160)}`);
        }

        const { msgs = [], hasMore } = await res.json();
        if (!msgs.length) break;

        paginas.unshift(msgs); // la página más vieja queda primero
        if (!hasMore) break;

        // msgs viene ascendente: el más viejo de esta página marca el corte
        before = msgs[0].seq;
        if (typeof before !== 'number') break;
      }

      let aplicados = 0;
      for (const pagina of paginas) {
        for (const msg of pagina) {
          if (msg.retracted) continue;
          if (this.aplicar(msg)) aplicados++;
        }
      }

      this.cargado = true;
      console.log(
        `[suscripciones] ${this.porUsuario.size} usuarios activos ` +
          `(${aplicados} registros en ${paginas.length} páginas)`
      );
    } catch (err) {
      // Sin registro seguimos publicando al mapa; solo no mandamos avisos.
      console.error(`[suscripciones] ✗ no se pudo cargar: ${err.message}`);
      this.cargado = false;
    }

    return this.porUsuario.size;
  }

  /**
   * Registra o da de baja a un usuario.
   *
   * Escribe en dos sitios a propósito: el Map en memoria (para que el aviso
   * funcione en el siguiente ciclo, sin esperas) y el canal de Portal (para
   * que sobreviva al próximo reinicio de Render). El canal es la verdad
   * persistente; el Map es la copia caliente.
   */
  async registrar(userId, distrito) {
    if (!userId) throw new Error('Falta userId');

    this.aplicar({ content: { userId, distrito } });

    try {
      const res = await fetch(`${API_BASE}/channels/${this.canal}/messages`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          senderId: 'radar-backend',
          type: 'system',
          content: { userId, distrito: distrito || null, ts: Date.now() },
        }),
      });

      if (!res.ok) {
        const texto = await res.text();
        // El Map ya quedó actualizado: el aviso funciona igual hasta el
        // próximo reinicio. Solo perdimos la persistencia de este cambio.
        console.error(
          `[suscripciones] ✗ no se persistió (${res.status}): ${texto.slice(0, 140)}`
        );
        return { aplicado: true, persistido: false };
      }

      return { aplicado: true, persistido: true };
    } catch (err) {
      console.error(`[suscripciones] ✗ red al persistir: ${err.message}`);
      return { aplicado: true, persistido: false };
    }
  }

  /** Usuarios suscritos a un distrito. */
  usuariosDe(distrito) {
    const buscado = normalizar(distrito);
    const encontrados = [];
    for (const [userId, d] of this.porUsuario) {
      if (d === buscado) encontrados.push(userId);
    }
    return encontrados;
  }

  /** Cuántos usuarios hay por distrito, para el endpoint de estado. */
  resumen() {
    const conteo = {};
    for (const d of this.porUsuario.values()) {
      conteo[d] = (conteo[d] || 0) + 1;
    }
    return conteo;
  }

  get total() {
    return this.porUsuario.size;
  }
}

module.exports = { RegistroDeSuscripciones };