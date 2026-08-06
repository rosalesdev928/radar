require('dotenv').config();
const express = require('express');

const { scrapearBomberos } = require('./scraper');
const { DetectorDeCambios } = require('./detector');
const { PortalPublisher } = require('./portal');
const { clasificar } = require('./agente');
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
const cache = new Map(); // id -> evento clasificado

const estadisticas = {
  ciclos: 0,
  publicados: 0,
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
app.use((_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/', (_, res) => {
  const distritos = [...new Set([...cache.values()].map((e) => e.distrito))];
  res.json({
    servicio: 'Radar — backend',
    cobertura: 'Lima Metropolitana (43 distritos)',
    canalGlobal: CONFIG.canalGlobal,
    distritosConEventos: distritos.length,
    eventosEnCache: cache.size,
    ia: CONFIG.ia.aiEnabled ? 'activa' : 'bypass',
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

app.get('/salud', (_, res) => res.json({ ok: true }));

app.listen(CONFIG.puerto, '0.0.0.0', () => {
  console.log(`\n🛰  Radar backend en puerto ${CONFIG.puerto}`);
  console.log(`   Cobertura: Lima Metropolitana — 43 distritos`);
  console.log(`   Canal global: ${CONFIG.canalGlobal}`);
  console.log(`   Canales por distrito: ${CONFIG.ciudad}:<distrito>`);
  console.log(`   IA: ${CONFIG.ia.aiEnabled ? 'activa' : 'BYPASS'}\n`);

  ejecutarCiclo();
  setInterval(ejecutarCiclo, CONFIG.intervalo * 1000);
});