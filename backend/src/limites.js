/**
 * Protección del endpoint que cuesta dinero.
 *
 * `/analizar` llama a la API de Anthropic. Sin freno, cualquiera con la URL
 * del backend —que está en el README público— puede vaciar los créditos en
 * minutos con un bucle de veinte líneas.
 *
 * Tres capas, de la más barata a la más cara:
 *
 *   1. Origen         — solo responde a los frontends declarados.
 *   2. Frecuencia     — cubo de fichas por IP.
 *   3. Presupuesto    — techo global de llamadas por hora, pase lo que pase.
 *
 * Todo en memoria: sin Redis, sin dependencias. Se pierde al reiniciar, que
 * para este alcance es aceptable — un reinicio de Render regala una ventana,
 * no barra libre.
 */

/* ------------------------------------------------------------------ *
 * 1. Origen permitido
 * ------------------------------------------------------------------ */

/**
 * CORS abierto a `*` significa que cualquier página web puede llamar a tu
 * backend desde el navegador de sus visitantes. Restringirlo no detiene a
 * quien use curl, pero sí corta el abuso desde el navegador, que es el
 * vector fácil.
 */
function crearCors({ permitidos = [] }) {
  const lista = permitidos.filter(Boolean);

  return function cors(req, res, next) {
    const origen = req.headers.origin;

    if (!lista.length) {
      // Sin lista configurada seguimos abiertos, para no romper desarrollo
      res.header('Access-Control-Allow-Origin', '*');
    } else if (origen && lista.includes(origen)) {
      res.header('Access-Control-Allow-Origin', origen);
      res.header('Vary', 'Origin');
    } else if (!origen) {
      // Peticiones sin origen (curl, apps nativas, monitores) pasan: el
      // filtro de origen protege del navegador, no es autenticación.
      res.header('Access-Control-Allow-Origin', '*');
    } else {
      return res.status(403).json({ error: 'origen_no_permitido' });
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

/* ------------------------------------------------------------------ *
 * 2. Frecuencia por IP
 * ------------------------------------------------------------------ */

/**
 * Cubo de fichas: cada IP empieza con `capacidad` fichas y recupera
 * `porMinuto` cada minuto. Permite ráfagas cortas (abrir tres hilos seguidos
 * es uso normal) pero corta el goteo sostenido de un bot.
 */
function crearLimitador({ capacidad = 8, porMinuto = 4, nombre = 'ruta' }) {
  const cubos = new Map();

  // Sin esto, cada IP que pase por aquí se queda en memoria para siempre
  const limpieza = setInterval(() => {
    const corte = Date.now() - 30 * 60000;
    for (const [ip, c] of cubos) {
      if (c.visto < corte) cubos.delete(ip);
    }
  }, 10 * 60000);
  limpieza.unref?.();

  return function limitar(req, res, next) {
    // Render pone la IP real en x-forwarded-for; req.ip sería la del proxy
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'desconocida';

    const ahora = Date.now();
    let c = cubos.get(ip);

    if (!c) {
      c = { fichas: capacidad, visto: ahora };
      cubos.set(ip, c);
    } else {
      const minutos = (ahora - c.visto) / 60000;
      c.fichas = Math.min(capacidad, c.fichas + minutos * porMinuto);
      c.visto = ahora;
    }

    if (c.fichas < 1) {
      const esperaS = Math.ceil((1 - c.fichas) / (porMinuto / 60));
      res.setHeader('Retry-After', esperaS);
      console.warn(`[limite] ${nombre} · ${ip} agotó su cuota`);
      return res.status(429).json({
        error: 'demasiadas_peticiones',
        mensaje: `Estás yendo muy rápido. Intenta en ${esperaS} segundos.`,
      });
    }

    c.fichas -= 1;
    next();
  };
}

/* ------------------------------------------------------------------ *
 * 3. Presupuesto global
 * ------------------------------------------------------------------ */

/**
 * Techo duro de llamadas a la IA por hora, sumando a todos los usuarios.
 *
 * El límite por IP no basta: cien IPs distintas dentro de su cuota pueden
 * vaciar la cuenta igual. Esto es el fusible — prefiero que el análisis deje
 * de funcionar una hora a quedarme sin créditos a mitad de una demo.
 */
class Presupuesto {
  constructor({ porHora = 60 }) {
    this.porHora = porHora;
    this.gastadas = 0;
    this.ventana = Date.now();
    this.rechazadas = 0;
  }

  hayMargen() {
    const ahora = Date.now();
    if (ahora - this.ventana > 3600000) {
      this.gastadas = 0;
      this.ventana = ahora;
    }
    return this.gastadas < this.porHora;
  }

  consumir() {
    this.gastadas++;
  }

  rechazar() {
    this.rechazadas++;
  }

  estado() {
    const restanMin = Math.max(
      0,
      Math.ceil((3600000 - (Date.now() - this.ventana)) / 60000)
    );
    return {
      porHora: this.porHora,
      gastadas: this.gastadas,
      rechazadas: this.rechazadas,
      reinicioEnMin: restanMin,
    };
  }
}

module.exports = { crearCors, crearLimitador, Presupuesto };