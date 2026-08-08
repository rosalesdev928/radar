# Radar

**Mapa en vivo de emergencias reales de Lima Metropolitana.**

Construido para The Realtime Hackathon by Portal — 7 al 9 de agosto de 2026.

🔗 **App:** https://radar-lovat-ten.vercel.app
📺 **Demo:** _(pendiente)_
📐 **Arquitectura:** [ARQUITECTURA.md](ARQUITECTURA.md)

---

## Qué es

En Lima ocurren alrededor de 140 emergencias cada 24 horas. El Cuerpo General de
Bomberos Voluntarios del Perú las publica en una tabla HTML que nadie mira, con
jerga técnica que nadie entiende y sin forma de saber cuáles pasan cerca de ti.

Radar las pone en un mapa vivo. Pero el problema de fondo es otro, y es el que
hace interesante el proyecto:

**El parte oficial se escribe en el momento del despacho.** Dice cuántas
unidades salieron, no cuántas hay ahora. Dice lo que reportó quien llamó, no lo
que se ve en la calle diez minutos después. Entre el parte y la realidad hay una
brecha que solo pueden cerrar las personas que están ahí.

Por eso cada incidente abre un hilo donde los vecinos reportan lo que ven, y un
agente de IA contrasta ese hilo contra el parte oficial. En pruebas reales
detectó una discrepancia: *"dos unidades de bomberos en escena, no una como
indica el parte"*.

No hay datos simulados. Todo lo que aparece en el mapa pasó de verdad.

---

## Lo que hace

**Mapa en tiempo real.** 43 distritos, actualización cada 30 segundos. Con tu
ubicación activa dibuja un radio de 2 km que te sigue si te mueves; los eventos
que caen dentro laten en azul.

**Aviso por cercanía.** Cuando entra una emergencia dentro de tu radio, salta un
aviso con la distancia real — *"Incendio a 840 m"*. **Solo uno: el más
cercano.** Si entran seis a la vez, seis notificaciones no informan, molestan, y
a la segunda dejas de leerlas. El cálculo es local: tu posición nunca sale del
navegador.

**Avisos por distrito.** Alternativa para cuando no quieres compartir ubicación.
El servidor decide a quién le toca y entrega a la bandeja de Portal, así que no
depende de tener la pestaña abierta mirando.

**Hilo ciudadano por incidente.** Chat en vivo con presencia, indicador de
escritura y reacciones con emoji. Los vecinos votan si lo confirman, si no ven
nada o si ya terminó, y califican la gravedad del 1 al 5.

**Analista de hilos.** Un agente lee el hilo y lo contrasta con el parte:
corroborado, ampliado, contradictorio, sin confirmar o ruido. Extrae los datos
que los vecinos aportan y el parte no tiene.

**Vigilante autónomo.** Corre solo, mira el conjunto de la ciudad y avisa cuando
encuentra un patrón: tres incendios en el mismo distrito en media hora, o un pico
de volumen sobre el promedio del día. Nadie lo dispara.

**Moderación en el borde.** El chat filtra insultos y enlaces dentro de Portal,
antes de que el mensaje llegue a nadie.

**Analítica.** Ritmo horario del día y distritos con más carga, cruzando volumen
contra proporción de graves — un distrito con 3 graves de 5 emergencias pesa
más que otro con 2 de 10, y un ranking por volumen invertiría el orden.

**Interfaz.** PWA instalable, mapa en claro u oscuro, y una pantalla de entrada
con un shader WebGL de metal líquido escrito a mano: ruido fractal con
deformación de dominio e iluminación especular por píxel, en 6 KB y sin
dependencias de terceros.

---

## Cómo se usa Portal

Portal es la capa completa de estado. **No hay base de datos propia.**

**Canales por distrito.** Cada evento se publica a `radar:<distrito>` y al
agregado `radar:todos`. El nombre se deriva del distrito, así que sumar una
ciudad nueva no requiere cambiar código.

**Un canal como bitácora persistente.** El free tier de Render reinicia el
proceso sin avisar; un `Map` en memoria con los suscriptores se borraría en cada
reinicio. Por eso `radar:suscripciones` es un canal de Portal: el backend lo lee
al arrancar y reduce ese log a memoria. Un canal es un log de *append*, no una
tabla — la reducción recorre el historial en orden y el último mensaje de cada
usuario gana.

**Identidad sin login.** La bandeja de Portal está vacía para usuarios anónimos,
así que las notificaciones nunca llegarían. La salida no fue OAuth: el navegador
genera un UUID local y el backend lo cambia por un JWT con
`POST /v1/tokens`. El usuario no se registra en nada, pero para Portal es un
usuario identificado. El token se pide por callback y no como string fijo — un
string no se puede refrescar y la app se caería sola a las dos horas.

**Middleware de publicación.** `portal.config.ts` define `onPublish` sobre
`radar:chat:*`. Enmascara insultos (no bloquea: el reporte puede ser útil aunque
venga con una lisura), rechaza enlaces y limita longitud. Corre en el borde, así
que un cliente modificado tampoco puede saltárselo.

**Bandeja de notificaciones.** El backend manda un ítem por usuario suscrito con
`POST /v1/users/{userId}/notifications`, con idempotency-key
`radar-{parte}-{usuario}` para que reprocesar un ciclo no duplique el aviso. El
frontend lo recibe por `useInbox`.

**Presencia, escritura y reacciones** en cada hilo, sobre el mismo canal.

**Lo que Portal no necesita saber.** El aviso por cercanía se calcula en el
navegador con los eventos que ya llegan por el canal global. Ni Portal ni el
backend reciben la posición del usuario: la alternativa —mandar coordenadas al
servidor para que filtrara— habría sido más simple de escribir y peor para quien
usa la app.

---

## Cómo se usa la IA

Tres agentes, con propósitos distintos.

**Normalizador.** Traduce la jerga del parte a lenguaje legible y asigna tipo.
Procesa en lotes de 8 — con 15 la respuesta JSON se truncaba en silencio. Si
falla, hay fallback por reglas: la app nunca depende de que la IA responda.

**Analista de hilos.** Contrasta lo que dicen los vecinos contra el parte
oficial. El prompt tiene reglas explícitas contra el sesgo de confirmación:

> Votos "confirmo" ALTOS pero NADIE describe nada concreto → NO subas la
> confianza. Puede ser gente pulsando porque vio que otros pulsaron.

Un voto no es evidencia. Solo modula la confianza de lo que ya dice el texto.

**Vigilante.** La detección de patrones es determinista y gratis: reglas sobre la
caché en memoria. Claude solo entra cuando una regla ya disparó, y únicamente
para decidir si merece publicarse. Tiene permiso explícito para callarse —
tres emergencias médicas dispersas en un distrito grande son ruido estadístico en
una ciudad de diez millones, y el prompt le dice que las descarte.

---

## Correrlo

```bash
# Backend
cd backend
npm install
cp .env.example .env    # completar PORTAL_SECRET y ANTHROPIC_API_KEY
npm start

# Frontend
cd frontend
npm install
cp .env.example .env    # completar VITE_PORTAL_KEY y VITE_BACKEND_URL
npm run dev

# Configuración de Portal (moderación)
export PORTAL_SECRET=sk_...
npx @portalsdk/cli deploy
```

**Prueba de carga** — mide el camino de un usuario nuevo contra el backend, que
es el cuello de botella real:

```bash
cd backend
node carga.js --usuarios 25
```

---

## Límites conocidos

Están declarados a propósito y desarrollados en
[ARQUITECTURA.md](ARQUITECTURA.md):

- Las notificaciones son de bandeja, no push del sistema con la app cerrada. La
  API de Portal en v1 no tiene destinos externos.
- La identidad es por navegador, no por persona: alguien puede limpiar
  `localStorage` y votar de nuevo. Por eso el diseño trata los votos como señal
  débil, no como verdad.
- El endpoint de token acuña para cualquier id que le pidan, sin prueba de
  posesión.
- La web de Bomberos devuelve páginas vacías de forma intermitente, así que la
  latencia real de detección puede superar los 30 segundos del intervalo.

---

## Stack

Node.js · Express · Cheerio · React · Vite · Leaflet · Tailwind · Portal SDK ·
API de Anthropic · Render · Vercel

---

## Licencia

MIT — ver [LICENSE](LICENSE).

Radar no reemplaza al 116. Ante una emergencia, llama.