require('dotenv').config();
const express = require('express');

const { scrapearBomberos } = require('./scraper');
const { DetectorDeCambios } = require('./detector');
const { PortalPublisher } = require('./portal');
const { clasificar } = require('./agente');
const { analizarHilo } = require('./analista');
const { RegistroDeSuscripciones } = require('./suscripciones');
const { Avisador } = require('./avisos');
const { Vigilante } = require('./vigilante');
const { crearCors, crearLimitador, Presupuesto } = require('./limites');
const { responderVoz } = require('./voz');
const { esDeLima, slug, normalizar } = require('./distritos');

const CIUDAD = process.env.CIUDAD || 'radar';

const CONFIG = {
  ciudad: CIUDAD,
  canalGlobal: `${CIUDAD}:todos`,
  intervalo: parseInt(process.env.INTERVALO_SEGUNDOS || '90', 10),
  puerto: process.env.PORT || 4321,
  ia: {
    aiEnabled: process.env.AI_ENABLED === 'true',
    apiKey: process.env.ANTHROPIC_API_KEY,
    modelo: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  },
};

const portal = new PortalPublisher({ secretKey: process.env.PORTAL_SECRET });
const detector = new DetectorDeCambios();
const registro = new RegistroDeSuscripciones({
  secretKey: process.env.PORTAL_SECRET,
  canal: `${CIUDAD}:suscripciones`,
});
const avisador = new Avisador({ secretKey: process.env.PORTAL_SECRET });
const vigilante = new Vigilante({
  secretKey: process.env.PORTAL_SECRET,
  canal: `${CIUDAD}:alertas`,
  ia: CONFIG.ia,
  // Revisar cada 30 s no aporta: los patrones tardan en formarse.
  cadaCiclos: parseInt(process.env.VIGILANTE_CADA_CICLOS || '10', 10),
});
const cache = new Map(); // id -> evento clasificado

// El primer ciclo tras arrancar trae el día entero: se trata distinto.
let primerCiclo = true;

const estadisticas = {
  ciclos: 0,
  publicados: 0,
  avisados: 0,
  ultimoCiclo: null,
  ultimoError: null,
};

async function ejecutarCiclo() {
  estadisticas.ciclos++;

  // El vigilante razona sobre el acumulado del día, no sobre este ciclo, así
  // que corre siempre — la mayoría de ciclos no traen partes nuevos y antes
  // se quedaba detrás de la salida temprana, sin ejecutarse nunca.
  // Si falla, no debe tumbar el ciclo: es una capa opcional.
  try {
    await vigilante.revisar([...cache.values()]);
  } catch (err) {
    console.error(`[vigilante] ✗ ${err.message}`);
  }

  try {
    const { todos } = await scrapearBomberos();
    const deLima = todos.filter((e) => e.distrito && esDeLima(e.distrito));
    const { nuevos, actualizados } = detector.procesar(deLima);
    const aPublicar = [...nuevos, ...actualizados];

    // Solo avisamos por partes nuevos. Un cambio de estado en uno ya
    // conocido no merece volver a sonar en el bolsillo de nadie.
    const idsNuevos = new Set(nuevos.map((e) => e.id));

    if (!aPublicar.length) {
      estadisticas.ultimoCiclo = new Date().toISOString();
      return;
    }

    /* El backfill NO pasa por la IA.
     *
     * Al reiniciar, la caché arranca vacía y el detector ve los ~95 partes del
     * día como nuevos. Clasificarlos con IA cuesta unos veinticinco centavos
     * cada vez, y el free tier de Render reinicia por inactividad, por cada
     * deploy y por cada cambio de variable. En una tarde de desarrollo eso son
     * varios dólares en reprocesar lo mismo.
     *
     * Para el volcado inicial usamos las reglas de severidad.js: la
     * descripción queda menos pulida, pero el tipo y la gravedad son
     * correctos. La IA se reserva para lo que llega después, que es donde
     * aporta de verdad.
     */
    const esBackfill = primerCiclo && aPublicar.length > 20;
    const config = esBackfill ? { ...CONFIG.ia, aiEnabled: false } : CONFIG.ia;

    if (esBackfill) {
      console.log(
        `[ciclo] volcado inicial de ${aPublicar.length} partes sin IA (ahorro ~$0.25)`
      );
    }

    // La IA procesa en lotes de 8 para no truncar la respuesta JSON
    const clasificados = [];
    for (let i = 0; i < aPublicar.length; i += 8) {
      const lote = aPublicar.slice(i, i + 8);
      clasificados.push(...(await clasificar(lote, config)));
    }

    primerCiclo = false;

    let publicados = 0;
    for (const ev of clasificados) {
      const canalDistrito = `${CONFIG.ciudad}:${slug(ev.distrito)}`;

      // Canal por distrito (escalable) + canal agregado de la ciudad
      if (await portal.publicar(ev, canalDistrito)) publicados++;
      await portal.publicar(ev, CONFIG.canalGlobal);

      cache.set(ev.id, ev);

      if (idsNuevos.has(ev.id)) {
        const avisados = await avisador.avisarDelEvento(ev, registro);
        estadisticas.avisados += avisados;
      }

      // Pausa para no saturar Portal en el ciclo inicial (~111 eventos)
      await new Promise((r) => setTimeout(r, 100));
    }

    estadisticas.publicados += publicados;
    estadisticas.ultimoCiclo = new Date().toISOString();
    estadisticas.ultimoError = null;


    const porDistrito = clasificados.reduce((m, e) => {
      m[e.distrito] = (m[e.distrito] || 0) + 1;
      return m;
    }, {});

    console.log(
      `[${new Date().toISOString()}] ${nuevos.length} nuevos, ${actualizados.length} actualizados → ` +
        `${publicados} publicados (${CONFIG.ia.aiEnabled ? 'IA' : 'bypass'})`
    );
    console.log(`   ${Object.entries(porDistrito).map(([d, n]) => `${d}:${n}`).join('  ')}`);
  } catch (err) {
    estadisticas.ultimoError = err.message;
    console.error(`[ciclo ${estadisticas.ciclos}] ✗ ${err.message}`);
  }
}

const app = express();
app.use(express.json({ limit: '256kb' }));

app.use(
  crearCors({
    permitidos: (process.env.ORIGENES_PERMITIDOS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  })
);

/* Freno del endpoint que cuesta dinero. Los números son deliberadamente
   holgados para un usuario real —abrir varios hilos seguidos es normal— y
   estrechos para un bucle automatizado. */
const limiteAnalisis = crearLimitador({ capacidad: 6, porMinuto: 3, nombre: '/analizar' });
const limiteToken = crearLimitador({ capacidad: 10, porMinuto: 5, nombre: '/token' });
const limiteVoz = crearLimitador({ capacidad: 5, porMinuto: 2, nombre: '/voz' });
const presupuesto = new Presupuesto({
  porHora: parseInt(process.env.IA_LLAMADAS_POR_HORA || '60', 10),
});

// Cache de analisis por evento: evita re-analizar el mismo hilo sin cambios
const analisis = new Map();

/** Firma del estado del hilo: si no cambia, no volvemos a llamar a la IA. */
function firmaDelHilo(mensajes, votos, gravedad) {
  const v = votos ?? {};
  return [
    mensajes.length,
    v.confirmo | 0,
    v.nada | 0,
    v.termino | 0,
    typeof gravedad === 'number' ? gravedad.toFixed(1) : '-',
  ].join(':');
}

app.get('/', (_, res) => {
  const distritos = [...new Set([...cache.values()].map((e) => e.distrito))];
  res.json({
    servicio: 'Radar — backend',
    cobertura: 'Lima Metropolitana (43 distritos)',
    canalGlobal: CONFIG.canalGlobal,
    distritosConEventos: distritos.length,
    eventosEnCache: cache.size,
    ia: CONFIG.ia.aiEnabled ? 'activa' : 'bypass',
    suscriptores: registro.total,
    porDistrito: registro.resumen(),
    avisos: avisador.estadisticas(),
    vigilante: vigilante.estadisticas(),
    presupuestoIA: presupuesto.estado(),
    canalAlertas: `${CONFIG.ciudad}:alertas`,
    ...estadisticas,
  });
});

app.get('/eventos', (req, res) => {
  const { distrito } = req.query;
  let eventos = [...cache.values()];
  if (distrito) {
    eventos = eventos.filter((e) => normalizar(e.distrito) === normalizar(distrito));
  }
  res.json(eventos);
});

/**
 * Analiza el hilo ciudadano de un evento y lo contrasta con el parte oficial.
 * El frontend manda los mensajes y el conteo de votos porque ya los tiene
 * en memoria via Portal.
 */
app.post('/analizar', limiteAnalisis, async (req, res) => {
  const { evento, mensajes, votos, gravedad } = req.body ?? {};

  if (!evento?.id || !Array.isArray(mensajes)) {
    return res.status(400).json({ error: 'Faltan evento o mensajes' });
  }

  // El evento tiene que existir de verdad. Sin esto, la caché de análisis se
  // indexa por un id que manda el cliente: basta con inventarse uno distinto
  // en cada petición para saltársela y forzar una llamada a la IA cada vez.
  const real = cache.get(evento.id);
  if (!real) {
    return res.status(404).json({ error: 'evento_desconocido' });
  }

  if (mensajes.length > 60) {
    return res.status(413).json({ error: 'hilo_demasiado_largo' });
  }

  if (!presupuesto.hayMargen()) {
    presupuesto.rechazar();
    const { reinicioEnMin } = presupuesto.estado();
    console.warn('[presupuesto] techo horario alcanzado');
    return res.status(429).json({
      error: 'presupuesto_agotado',
      mensaje: `El análisis con IA alcanzó su límite por hora. Vuelve en ${reinicioEnMin} min.`,
    });
  }

  if (!CONFIG.ia.aiEnabled || !CONFIG.ia.apiKey) {
    return res.status(503).json({
      error: 'ia_apagada',
      mensaje: 'El analisis con IA no esta activo en este momento.',
    });
  }

  // Si ni los mensajes ni los votos cambiaron, devolvemos el analisis guardado
  const firma = firmaDelHilo(mensajes, votos, gravedad);
  const previo = analisis.get(evento.id);
  if (previo && previo.firma === firma) {
    return res.json({ ...previo.resultado, _cacheado: true });
  }

  try {
    presupuesto.consumir();
    // Analizamos el parte que tenemos nosotros, no el que mandó el cliente:
    // así nadie puede inyectar una descripción falsa en el prompt.
    const resultado = await analizarHilo(
      { evento: real, mensajes, votos, gravedad },
      CONFIG.ia
    );
    analisis.set(evento.id, { firma, resultado });
    res.json(resultado);
  } catch (err) {
    console.error(`[analizar ${evento.id}] ✗ ${err.message}`);
    res.status(502).json({ error: 'fallo_ia', mensaje: err.message });
  }
});

/**
 * Acuña un JWT de Portal para un dispositivo.
 *
 * Esto NO es un login: el frontend genera un id local (localStorage) y lo
 * cambia por un token. Sirve para que Portal trate al visitante como usuario
 * con identidad estable, que es requisito para que la bandeja funcione —
 * los usuarios anónimos tienen la bandeja permanentemente vacía.
 *
 * El token dura poco a propósito: el cliente lo re-pide solo al expirar.
 */
app.post('/token', limiteToken, async (req, res) => {
  const { dispositivo } = req.body ?? {};

  if (typeof dispositivo !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(dispositivo)) {
    return res.status(400).json({ error: 'dispositivo_invalido' });
  }

  const userId = `radar_${dispositivo}`;

  try {
    const r = await fetch('https://api.useportal.co/v1/tokens', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PORTAL_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, ttl: '2h', claims: { app: 'radar' } }),
    });

    if (!r.ok) {
      const texto = await r.text();
      console.error(`[token] ✗ Portal ${r.status}: ${texto.slice(0, 160)}`);
      return res.status(502).json({ error: 'portal_rechazo_el_token' });
    }

    const data = await r.json();
    res.json({ token: data.token, expiraEn: data.expiresAt, userId });
  } catch (err) {
    console.error(`[token] ✗ ${err.message}`);
    res.status(500).json({ error: 'no_se_pudo_acunar' });
  }
});

/**
 * Alta o baja de avisos por distrito.
 * El frontend manda su userId de Portal (anon_...) y el distrito elegido.
 * Mandar distrito null da de baja.
 */
app.post('/suscribir', async (req, res) => {
  const { userId, distrito } = req.body ?? {};

  if (typeof userId !== 'string' || !userId.trim()) {
    return res.status(400).json({ error: 'Falta userId' });
  }

  if (distrito != null && (typeof distrito !== 'string' || !esDeLima(distrito))) {
    return res.status(400).json({ error: 'Distrito fuera de Lima Metropolitana' });
  }

  try {
    const r = await registro.registrar(userId.trim(), distrito || null);
    res.json({ ...r, distrito: distrito || null, suscriptores: registro.total });
  } catch (err) {
    console.error(`[suscribir] ✗ ${err.message}`);
    res.status(500).json({ error: 'no_se_pudo_registrar' });
  }
});

/**
 * Consulta hablada.
 *
 * El frontend transcribe con el reconocimiento de voz del navegador, calcula
 * qué eventos tiene cerca y manda solo eso: la posición del usuario no llega
 * al servidor, únicamente las distancias ya resueltas.
 */
app.post('/voz', limiteVoz, async (req, res) => {
  const { pregunta, cercanos, porDistrito, contexto } = req.body ?? {};

  if (typeof pregunta !== 'string' || !pregunta.trim()) {
    return res.status(400).json({ error: 'falta_pregunta' });
  }

  if (!CONFIG.ia.aiEnabled || !CONFIG.ia.apiKey) {
    return res.status(503).json({
      error: 'ia_apagada',
      mensaje: 'La consulta por voz no está disponible ahora.',
    });
  }

  if (!presupuesto.hayMargen()) {
    presupuesto.rechazar();
    const { reinicioEnMin } = presupuesto.estado();
    return res.status(429).json({
      error: 'presupuesto_agotado',
      mensaje: `Alcancé mi límite de consultas por hora. Vuelve en ${reinicioEnMin} minutos.`,
    });
  }

  // Los eventos los verifica el backend contra su propia caché: el cliente
  // manda ids y distancias, no descripciones que podrían ser inventadas.
  const verificados = (Array.isArray(cercanos) ? cercanos : [])
    .slice(0, 12)
    .map((c) => {
      const real = cache.get(c?.id);
      if (!real) return null;
      return { ...real, metros: typeof c.metros === 'number' ? c.metros : undefined };
    })
    .filter(Boolean);

  try {
    presupuesto.consumir();
    /* Índice por distrito.
     *
     * Lo preferimos armado desde la caché propia, para que el cliente no
     * pueda inyectar eventos inventados en el prompt. Pero la caché se vacía
     * en cada reinicio de Render y tarda cerca de un minuto en rellenarse
     * —los eventos se clasifican con IA en lotes antes de guardarse—, y en
     * esa ventana el navegador sabe más que el servidor: él lee el historial
     * de Portal y tiene la lista completa.
     *
     * Responder "no hay nada en Breña" porque el servidor acaba de arrancar
     * es peor que confiar en el cliente para un dato que, además, ya es
     * público en el canal de Portal. Así que usamos la caché cuando la hay y
     * caemos al índice del cliente cuando está vacía.
     */
    let indice = {};
    for (const e of cache.values()) {
      if (!e.distrito) continue;
      (indice[e.distrito] ??= []).push({
        tipo: e.tipo,
        descripcion: e.descripcion,
        gravedad: e.relevancia,
        estado: e.estado,
        hora: e.hora,
      });
    }

    let origenIndice = 'cache';
    if (!Object.keys(indice).length && porDistrito && typeof porDistrito === 'object') {
      origenIndice = 'cliente';
      indice = {};
      for (const [distrito, lista] of Object.entries(porDistrito).slice(0, 50)) {
        if (!Array.isArray(lista)) continue;
        indice[String(distrito).slice(0, 60)] = lista.slice(0, 25).map((e) => ({
          tipo: String(e?.tipo ?? '').slice(0, 40),
          descripcion: String(e?.descripcion ?? '').slice(0, 200),
          gravedad: String(e?.gravedad ?? '').slice(0, 20),
          estado: String(e?.estado ?? '').slice(0, 20),
          hora: String(e?.hora ?? '').slice(0, 40),
        }));
      }
    }

    console.log(
      `[voz] "${pregunta.slice(0, 60)}" · ${verificados.length} cerca · ` +
        `${Object.keys(indice).length} distritos en el índice (${origenIndice})`
    );

    const salida = await responderVoz(
      { pregunta, cercanos: verificados, porDistrito: indice, contexto },
      CONFIG.ia
    );
    res.json(salida);
  } catch (err) {
    console.error(`[voz] ✗ ${err.message}`);
    res.status(502).json({ error: 'fallo_ia', mensaje: err.message });
  }
});

app.get('/salud', (_, res) => res.json({ ok: true }));

app.listen(CONFIG.puerto, '0.0.0.0', () => {
  console.log(`\n🛰  Radar backend en puerto ${CONFIG.puerto}`);
  console.log(`   Cobertura: Lima Metropolitana — 43 distritos`);
  console.log(`   Canal global: ${CONFIG.canalGlobal}`);
  console.log(`   Canales por distrito: ${CONFIG.ciudad}:<distrito>`);
  console.log(`   IA: ${CONFIG.ia.aiEnabled ? 'activa' : 'BYPASS'}\n`);

  // El registro se reconstruye del canal antes del primer ciclo, para no
  // perder suscriptores cada vez que Render reinicia el proceso.
  registro.cargar().then(() => {
    ejecutarCiclo();
    setInterval(ejecutarCiclo, CONFIG.intervalo * 1000);
  });
});