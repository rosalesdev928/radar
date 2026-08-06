require('dotenv').config();
const { scrapearBomberos } = require('./src/scraper');
const { DetectorDeCambios } = require('./src/detector');
const { PortalPublisher, canalDeDistrito } = require('./src/portal');

(async () => {
  const detector = new DetectorDeCambios();
  const portal = new PortalPublisher({
    secretKey: process.env.PORTAL_SECRET,
    canal: process.env.PORTAL_CHANNEL,
  });

  console.log('Ciclo 1 — carga inicial\n');
  const { filtrados } = await scrapearBomberos();
  const r1 = detector.procesar(filtrados);

  console.log(`  Eventos en La Victoria: ${filtrados.length}`);
  console.log(`  Nuevos: ${r1.nuevos.length} | Actualizados: ${r1.actualizados.length}`);
  console.log(`  Canal calculado: ${canalDeDistrito('LA VICTORIA')}\n`);

  console.log('Publicando a Portal...');
  const ok = await portal.publicarLote(r1.nuevos);
  console.log(`  ✓ Publicados: ${ok}/${r1.nuevos.length}\n`);

  console.log('Ciclo 2 — sin cambios esperados\n');
  const { filtrados: f2 } = await scrapearBomberos();
  const r2 = detector.procesar(f2);
  console.log(`  Nuevos: ${r2.nuevos.length} | Actualizados: ${r2.actualizados.length}`);
  console.log(`  Total conocidos: ${detector.totalConocidos}`);
  console.log(r2.nuevos.length === 0 ? '\n✓ Deduplicación correcta' : '\n✗ Está republicando');
})();