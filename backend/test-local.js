const fs = require('fs');
const { parsearEmergencias, filtrarPorDistrito } = require('./src/scraper');

const html = fs.readFileSync('pagina.html', 'utf8');
const todos = parsearEmergencias(html);
const filtrados = filtrarPorDistrito(todos);

console.log(`Parseadas: ${todos.length}`);
console.log(`La Victoria: ${filtrados.length}\n`);

if (todos.length === 0) {
  console.log('Sigue en 0. Muestra de la primera fila con td:');
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  $('tr').each((i, f) => {
    if (i > 2) return;
    const t = $(f).find('td').map((_, c) => $(c).text().trim()).get();
    console.log(`  Fila ${i} (${t.length} celdas):`, JSON.stringify(t));
  });
} else {
  console.log('--- Primer evento parseado ---');
  console.log(todos[0]);
  console.log('\n--- La Victoria ---');
  filtrados.forEach((e) => {
    console.log(`[${e.id}] ${e.estado} | ${e.tipo}`);
    console.log(`   ${e.direccion} → ${e.lat},${e.lon} (válidas: ${e.coordenadas_validas})`);
  });
}