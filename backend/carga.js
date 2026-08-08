/**
 * Prueba de carga para Radar.
 *
 * ¿Por qué mide el backend y no el WebSocket de Portal?
 *
 * Porque el WebSocket no es el cuello de botella. Portal corre sobre Durable
 * Objects, diseñados para miles de conexiones por canal. El punto débil es
 * este backend: una sola instancia en el free tier de Render, por la que pasa
 * obligatoriamente cada usuario nuevo antes de poder conectarse.
 *
 * El camino que recorre alguien que abre Radar por primera vez es:
 *
 *    POST /token       ← acuña JWT (el backend llama a Portal por dentro)
 *    POST /suscribir   ← si activa avisos (el backend escribe en un canal)
 *    GET  /            ← estado
 *
 * Los tres son HTTP contra tu Express. Si 5000 personas abren la app a la vez
 * —el escenario de una emergencia grande, justo cuando más importa— es aquí
 * donde se rompe, no en Portal.
 *
 * ────────────────────────────────────────────────────────────────────────
 *  Empieza con --usuarios 25 y sube de a poco. Cada /token consume una
 *  llamada real a la API de Portal.
 *
 *  Por defecto NO se suscribe: eso escribiría usuarios falsos en tu registro
 *  de producción. Usa --suscribir solo si vas a limpiar después.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Uso:
 *   node carga.js --usuarios 25
 *   node carga.js --usuarios 200 --concurrencia 20
 *   node carga.js --usuarios 50 --url http://localhost:4321
 */

try { require('dotenv').config(); } catch { /* opcional: solo hace falta si usas .env */ }

/* ---------- Argumentos ---------- */

function arg(nombre, pordefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i === -1) return pordefecto;
  const sig = process.argv[i + 1];
  return sig && !sig.startsWith('--') ? sig : true;
}

const CONFIG = {
  usuarios: parseInt(arg('usuarios', '25'), 10),
  // Cuántas peticiones en vuelo a la vez. Lanzarlas todas de golpe mide un
  // pico que ningún tráfico real produce; esto simula llegada sostenida.
  concurrencia: parseInt(arg('concurrencia', '10'), 10),
  url: String(arg('url', 'https://radar-backend-fohp.onrender.com')).replace(/\/$/, ''),
  suscribir: arg('suscribir', false) === true,
  distrito: String(arg('distrito', 'COMAS')),
  timeoutMs: parseInt(arg('timeout', '20000'), 10),
};

/* ---------- Métricas ---------- */

function crearMedidor(nombre) {
  return { nombre, ok: 0, fallos: 0, latencias: [], porCodigo: new Map() };
}

const medidores = {
  token: crearMedidor('POST /token'),
  suscribir: crearMedidor('POST /suscribir'),
};

function anotar(medidor, ms, codigo) {
  medidor.porCodigo.set(codigo, (medidor.porCodigo.get(codigo) ?? 0) + 1);
  if (codigo === 200) {
    medidor.ok++;
    medidor.latencias.push(ms);
  } else {
    medidor.fallos++;
  }
}

function percentil(valores, p) {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))];
}

/* ---------- Peticiones ---------- */

async function pedir(ruta, cuerpo, medidor) {
  const inicio = Date.now();
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), CONFIG.timeoutMs);

  try {
    const res = await fetch(`${CONFIG.url}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: ctrl.signal,
    });

    const ms = Date.now() - inicio;
    anotar(medidor, ms, res.status);

    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    anotar(medidor, Date.now() - inicio, e.name === 'AbortError' ? 'timeout' : 'red');
    return null;
  } finally {
    clearTimeout(corte);
  }
}

/** Simula a una persona que abre Radar por primera vez. */
async function usuarioNuevo(n) {
  const dispositivo = `carga${process.pid}x${n}`.padEnd(12, '0').slice(0, 40);

  const token = await pedir('/token', { dispositivo }, medidores.token);
  if (!token?.userId) return;

  if (CONFIG.suscribir) {
    await pedir(
      '/suscribir',
      { userId: token.userId, distrito: CONFIG.distrito },
      medidores.suscribir
    );
  }
}

/* ---------- Ejecución con concurrencia limitada ---------- */

async function correr() {
  let siguiente = 0;
  let hechos = 0;

  async function trabajador() {
    while (siguiente < CONFIG.usuarios) {
      const mio = siguiente++;
      await usuarioNuevo(mio);
      hechos++;
      if (hechos % 10 === 0 || hechos === CONFIG.usuarios) {
        process.stdout.write(
          `  ${hechos}/${CONFIG.usuarios}   ok: ${medidores.token.ok}   fallos: ${medidores.token.fallos}\r`
        );
      }
    }
  }

  const hilos = Array.from(
    { length: Math.min(CONFIG.concurrencia, CONFIG.usuarios) },
    trabajador
  );
  await Promise.all(hilos);
}

/* ---------- Informe ---------- */

function tabla(medidor) {
  const total = medidor.ok + medidor.fallos;
  if (!total) return;

  console.log(`\n  ${medidor.nombre}`);
  console.log(`    éxito     ${medidor.ok}/${total}  (${((medidor.ok / total) * 100).toFixed(1)} %)`);

  if (medidor.latencias.length) {
    console.log(`    mediana   ${percentil(medidor.latencias, 50)} ms`);
    console.log(`    p95       ${percentil(medidor.latencias, 95)} ms`);
    console.log(`    máximo    ${Math.max(...medidor.latencias)} ms`);
  }

  const malos = [...medidor.porCodigo].filter(([c]) => c !== 200);
  if (malos.length) {
    console.log('    respuestas no-200:');
    for (const [codigo, n] of malos.sort((a, b) => b[1] - a[1])) {
      console.log(`      ${String(n).padStart(5)}  ${codigo}`);
    }
  }
}

function informe(segundos) {
  const total = medidores.token.ok + medidores.token.fallos;

  console.log('\n\n─────────────────────────────────────────');
  console.log(`  Destino:      ${CONFIG.url}`);
  console.log(`  Usuarios:     ${CONFIG.usuarios}`);
  console.log(`  Concurrencia: ${CONFIG.concurrencia}`);
  console.log(`  Duración:     ${segundos.toFixed(1)} s`);
  if (total) {
    console.log(`  Ritmo:        ${(total / segundos).toFixed(1)} peticiones/s`);
  }
  console.log('─────────────────────────────────────────');

  tabla(medidores.token);
  if (CONFIG.suscribir) tabla(medidores.suscribir);

  const t = medidores.token;
  const p95 = percentil(t.latencias, 95);

  console.log('\n  Lectura');
  if (t.fallos > total * 0.05) {
    console.log('    Más del 5 % falló. El backend no aguanta este ritmo.');
  } else if (p95 && p95 > 5000) {
    console.log('    Responde, pero el p95 pasa de 5 s: la app tardaría en abrir.');
  } else if (p95 && p95 > 2000) {
    console.log('    Aguanta, con latencia perceptible al abrir.');
  } else {
    console.log('    Sin problemas a este nivel. Sube --usuarios.');
  }
  console.log('─────────────────────────────────────────\n');
}

/* ---------- Arranque ---------- */

async function main() {
  if (CONFIG.suscribir && CONFIG.url.includes('onrender.com')) {
    console.error(
      '\n✗ --suscribir contra producción metería usuarios falsos en tu registro.\n' +
        '  Quítalo, o apunta a local con --url http://localhost:4321\n'
    );
    process.exit(1);
  }

  console.log(
    `\nSimulando ${CONFIG.usuarios} usuarios nuevos contra ${CONFIG.url}` +
      `\n(${CONFIG.concurrencia} en paralelo${CONFIG.suscribir ? ', con suscripción' : ''})\n`
  );

  // El free tier de Render duerme tras 15 min: la primera petición puede
  // tardar 50 s solo en despertar el servicio, y ensuciaría la mediana.
  process.stdout.write('  Despertando el servicio…');
  const t0 = Date.now();
  try {
    await fetch(`${CONFIG.url}/salud`, { signal: AbortSignal.timeout(60000) });
    console.log(` listo (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
  } catch {
    console.log(' sin respuesta, sigo igual\n');
  }

  const inicio = Date.now();
  await correr();
  informe((Date.now() - inicio) / 1000);
}

process.on('SIGINT', () => {
  console.log('\n\nInterrumpido.');
  informe(1);
  process.exit(0);
});

main();