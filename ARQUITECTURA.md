# Arquitectura de Radar

Documento para quien quiera entender por qué Radar está construido así, no solo
qué hace. Incluye las limitaciones conocidas, que son tan parte del diseño como
lo que funciona.

---

## El problema

En Lima ocurren alrededor de 140 emergencias cada 24 horas. El Cuerpo General de
Bomberos Voluntarios del Perú las publica en una tabla HTML pública que nadie
mira, con jerga técnica y sin ninguna forma de saber cuáles están pasando cerca
de ti.

Y hay un segundo problema, menos obvio: **el parte oficial se escribe en el
momento del despacho.** Dice cuántas unidades salieron, no cuántas hay ahora.
Dice lo que reportó quien llamó, no lo que se ve en la calle diez minutos
después. Entre el parte y la realidad hay una brecha que solo pueden cerrar las
personas que están ahí.

Radar ataca las dos cosas: pone las emergencias en un mapa vivo, y abre un hilo
por incidente donde los vecinos pueden contradecir o ampliar el parte oficial.

---

## Vista general

```
sgonorte.bomberosperu.gob.pe/24horas
              │  scraping cada 30 s
              ▼
      ┌───────────────────┐
      │  Backend (Node)   │  Render, free tier
      │                   │
      │  scraper.js       │  fetch + Cheerio, timeout 15 s
      │  detector.js      │  qué es nuevo vs. actualizado
      │  severidad.js     │  reglas: tipo y relevancia
      │  agente.js        │  clasificación con Claude (lotes de 8)
      │  suscripciones.js │  quién quiere avisos de qué distrito
      │  avisos.js        │  notificaciones por usuario
      └─────────┬─────────┘
                │  publish (secret key)
                ▼
      ┌───────────────────┐
      │      Portal       │  pub/sub, presencia, bandeja
      │                   │
      │  radar:todos          eventos de toda Lima
      │  radar:<distrito>     eventos por distrito
      │  radar:chat:<parte>   hilo ciudadano por incidente
      │  radar:suscripciones  bitácora de preferencias
      │                   │
      │  portal.config.ts │  moderación en el borde
      └─────────┬─────────┘
                │  WebSocket
                ▼
      ┌───────────────────┐
      │  Frontend (React) │  Vercel, PWA
      │                   │
      │  Mapa (Leaflet)   │
      │  Hilo por evento  │
      │  Bandeja (avisos) │
      └───────────────────┘
```

---

## Decisiones y por qué

### No hay base de datos

Radar no persiste nada propio. El estado vive en dos sitios: memoria del proceso
(caché de eventos del día) y canales de Portal (mensajes, votos, suscripciones).

Es una decisión, no una carencia. Los datos de origen son públicos y efímeros —
el feed de Bomberos solo cubre 24 horas — y todo lo que aportan los ciudadanos ya
tiene que viajar por Portal de todos modos. Meter Postgres habría añadido una
pieza que solo duplicaría lo que el canal ya guarda.

El precio es real y está asumido: si Portal pierde el historial de un canal, esa
información no está en ningún otro lado.

### Las suscripciones viven en un canal, no en memoria

El free tier de Render apaga el proceso tras 15 minutos de inactividad y lo
reinicia sin avisar. Un `Map` en memoria con los suscriptores se habría borrado
en cada reinicio.

Peor: los usuarios solo pueden volver a registrarse si tienen la app abierta —
justamente los que no están conectados, que son los que más necesitan el aviso,
serían los que quedarían fuera del registro.

Por eso `radar:suscripciones` es un canal de Portal. El backend lo lee al
arrancar y reduce ese log a un `Map`. En caliente trabaja contra el `Map`
(rápido); en frío lo reconstruye del canal (persistente).

Un canal es un log de *append*, no una tabla: si alguien cambia de distrito tres
veces quedan tres mensajes y gana el último. La reducción recorre el historial en
orden cronológico y sobreescribe.

### Identidad sin login

La bandeja de Portal está permanentemente vacía para usuarios anónimos. Sin
identidad estable, las notificaciones no llegarían nunca.

La salida no fue OAuth. El navegador genera un UUID, lo guarda en
`localStorage`, y el backend lo cambia por un JWT de Portal con
`userId = radar_<uuid>`. El usuario no se registra en nada, pero para Portal es
un usuario identificado y la bandeja funciona.

El token dura dos horas y se pide por callback, no como string fijo: un string no
se puede refrescar, y al expirar el canal quedaría en `blocked` — la app se
caería sola a las dos horas de estar abierta.

El mismo id resuelve la deduplicación de votos, que antes dependía del `sender`
de Portal y contaba varias veces al mismo usuario tras cada reconexión.

### La moderación corre en Portal, no en el navegador

`portal.config.ts` define un middleware `onPublish` sobre `radar:chat:*`. Filtra
insultos (enmascarando, no bloqueando: el reporte puede ser útil aunque venga con
una lisura), rechaza enlaces y limita la longitud.

Está en el borde de Portal a propósito. Un filtro en el frontend lo salta
cualquiera con las herramientas de desarrollador abiertas; este no.

El filtro normaliza antes de comparar — tildes, leetspeak (`M13RD@`), mayúsculas
— y tolera letras estiradas (`puuuuta`) haciendo que cada letra del patrón acepte
repetición. Lo que *no* hace es aplanar las repeticiones del texto: eso
convertiría "perra" en "pera" y filtraría fruta.

### Los avisos los decide el servidor

La primera versión comparaba listas en el navegador: si llegaba un evento del
distrito elegido, sonaba. Eso solo funciona con la pestaña abierta y mirando.

Ahora el backend detecta el parte nuevo, busca quién está suscrito a ese distrito
y manda una notificación por usuario a
`POST /v1/users/{userId}/notifications`. El frontend la recibe por `useInbox` y
ahí dispara el toast y el globo del sistema.

La `idempotency-key` es `radar-{parteId}-{userId}`: si un ciclo reprocesa un
parte, Portal devuelve el mismo ítem y no duplica el aviso.

Solo se avisa por partes **nuevos**. Un cambio de estado en uno ya conocido no
merece volver a sonar en el bolsillo de nadie.

### La IA no clasifica, contrasta

`agente.js` normaliza el texto del parte (jerga de bomberos a lenguaje legible) y
asigna tipo y relevancia. Si falla o está apagada, hay un fallback por reglas en
`severidad.js` — la app nunca depende de que la IA responda.

Lo interesante es `analista.js`: lee el hilo ciudadano y lo contrasta con el
parte oficial. Devuelve un veredicto (`corroborado`, `ampliado`,
`contradictorio`, `sin_confirmar`, `ruido`) y los datos que los vecinos aportan y
el parte no tiene.

El prompt tiene reglas explícitas contra el sesgo de confirmación:

- Muchos votos "lo confirmo" **pero nadie describe nada concreto** → no sube la
  confianza. Puede ser gente pulsando porque vio que otros pulsaron.
- Un voto no es evidencia. Solo modula la confianza de lo que ya dice el texto.
- Con menos de 3 votos, la muestra es demasiado chica: se ignoran.

En pruebas reales el agente detectó una discrepancia con el parte oficial —
"dos unidades de bomberos en escena, no una como indica el parte" — a partir del
texto libre de los vecinos.

### Escala por distrito desde el principio

El backend publica cada evento en dos canales: `radar:<distrito>` y
`radar:todos`. Hoy el frontend solo consume el global, pero la separación ya
está hecha: cuando un distrito tenga tráfico suficiente para justificar su propio
canal, no hay que refactorizar nada.

---

## Limitaciones conocidas

Estas son reales y están declaradas a propósito.

**El endpoint `/token` acuña para cualquier `dispositivo` que le pidan.** No hay
prueba de posesión: alguien que conozca el id de otro podría pedir un token con
esa identidad. Para el alcance actual (sin datos personales, sin acciones
destructivas) es aceptable; para producción haría falta un desafío firmado.

**Las notificaciones son de bandeja, no push del sistema operativo.** La API de
Portal en v1 entrega a la bandeja del usuario, con entrega en vivo si está
conectado — no hay destinos externos. El globo del sistema lo dispara el
frontend cuando detecta el ítem, así que solo aparece con la app abierta o en
segundo plano. Con la PWA cerrada del todo haría falta Web Push con VAPID.

**La identidad es por navegador, no por persona.** Alguien puede limpiar
`localStorage`, abrir una ventana privada o usar otro dispositivo y votar de
nuevo. Sin cuentas reales no hay forma de evitarlo. Por eso el diseño trata los
votos como señal débil y no como verdad: el analista tiene instrucciones
explícitas de no subir la confianza por volumen de votos sin texto que lo
respalde.

**El chat no tiene límite de frecuencia.** El middleware valida contenido, no
ritmo. Portal aplica su propio límite por canal, pero no hay control propio.

**El caché de eventos crece sin expiración** dentro de la vida del proceso. En
un proceso de días acumularía memoria; los reinicios del free tier lo enmascaran.

**La web de Bomberos devuelve páginas vacías de forma intermitente.** No es un
fallo de Radar: en observación real, peticiones consecutivas alternan entre
320 KB con 118 filas y 2.4 KB con ninguna. El scraper lo tolera (una página
vacía significa "sin cambios") pero implica que la latencia real de detección
puede ser mayor que el intervalo de 30 segundos.

---

## Rendimiento

Portal usa Durable Objects, que serializan las escrituras por canal. Eso elimina
las carreras entre publicaciones concurrentes al mismo canal — dos ciclos
solapados no pueden duplicar un evento por orden de llegada. La deduplicación
semántica (mismo incidente reportado dos veces con textos distintos) sí es
responsabilidad de la aplicación, y la resuelve `detector.js` por número de
parte.

El punto de saturación previsible **no es el WebSocket sino el envío de avisos**:
la API de notificaciones no acepta lotes, así que es una llamada HTTP por
usuario suscrito. Con muchos suscriptores en un mismo distrito, un solo evento
dispara esa misma cantidad de peticiones. Por eso hay un tope por evento
(`maxPorEvento`) y una pausa entre envíos. Para más volumen habría que pasar a
una cola.

El script `backend/carga.js` mide el comportamiento con conexiones concurrentes.

---

## Stack

**Backend** — Node.js 20, Express 5, Cheerio, Portal SDK, API de Anthropic
(Claude Sonnet).
**Frontend** — React 19, Vite 8, Leaflet, Tailwind CSS, `@portalsdk/react`, PWA.
**Infraestructura** — Render (backend), Vercel (frontend), cron-job.org
(keep-alive), Portal (tiempo real).
**Datos** — Cuerpo General de Bomberos Voluntarios del Perú, reporte público de
24 horas.

---

Radar no reemplaza al 116. Ante una emergencia, llama.
