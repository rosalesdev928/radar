require('dotenv').config();
const express = require('express');

const { scrapearBomberos } = require('./scraper');
const { DetectorDeCambios } = require('./detector');
const { PortalPublisher } = require('./portal');
const { clasificar } = require('./agente');
const { analizarHilo } = require('./analista');
const { RegistroDeSuscripciones } = require('./suscripciones');
const { Avisador } = require('./avisos');
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
const cache = new Map(); // id -> evento clasificado

const estadisticas = {
  ciclos: 0,
  publicados: 0,
  avisados: 0,
  ultimoCiclo: null,
  ultimoError: null,
};

async function ejecutarCiclo() {
  estadisticas.ciclos++;

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

    // La IA procesa en lotes de 8 para no truncar la respuesta JSON
    const clasificados = [];
    for (let i = 0; i < aPublicar.length; i += 8) {
      const lote = aPublicar.slice(i, i + 8);
      clasificados.push(...(await clasificar(lote, CONFIG.ia)));
    }

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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
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
app.post('/analizar', async (req, res) => {
  const { evento, mensajes, votos, gravedad } = req.body ?? {};

  if (!evento?.id || !Array.isArray(mensajes)) {
    return res.status(400).json({ error: 'Faltan evento o mensajes' });
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
    const resultado = await analizarHilo({ evento, mensajes, votos, gravedad }, CONFIG.ia);
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
app.post('/token', async (req, res) => {
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