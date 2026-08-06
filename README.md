# Radar

**Mapa en vivo de emergencias reales de Lima Metropolitana.**

Construido para The Realtime Hackathon by Portal — 7 al 9 de agosto de 2026.

🔗 **App:** _(URL de Vercel)_
📺 **Demo:** _(URL del video)_

---

## Qué es

En Lima ocurren alrededor de 140 emergencias cada 24 horas. El Cuerpo General
de Bomberos Voluntarios del Perú las publica en una tabla HTML pública que
nadie mira, con jerga técnica que nadie entiende y sin ninguna forma de saber
cuáles están pasando cerca de ti.

Radar toma esos datos, los traduce a lenguaje humano con un agente de IA,
calcula qué tan grave es cada uno, y los sincroniza en tiempo real con todos
los usuarios conectados a través de Portal.

No hay datos simulados. Todo lo que aparece en el mapa pasó de verdad.

---

## Arquitectura

```
Bomberos Perú — sgonorte.bomberosperu.gob.pe/24horas
        │  scraping cada 30 s
        ▼
Backend (Node.js + Express)
  · Cheerio parsea la tabla de emergencias
  · Regex extrae coordenadas GPS del texto de dirección
  · Detecta eventos nuevos y cambios de estado por N° de parte
  · Calcula gravedad según unidades movilizadas
  · Agente de IA (Claude) traduce a lenguaje natural
        │  publish
        ▼
Portal — radar:todos + radar:<distrito>
        │  subscribe (WebSocket)
        ▼
Frontend — PWA instalable (React + Vite + Leaflet)
```

---

## Cómo se usa Portal

Portal es la capa completa de sincronización. No hay base de datos propia.

**Publicación.** El backend publica cada evento clasificado vía REST a
`api.useportal.co/v1/channels/{canal}/messages`.

**Canales escalables por distrito.** Cada evento se publica a su canal
específico (`radar:miraflores`) y al agregado (`radar:todos`). El nombre del
canal se deriva del distrito, así que sumar una ciudad nueva no requiere
cambiar código — solo publicar a otro namespace.

**Suscripción.** El frontend usa `@portalsdk/react` con `useChannel` sobre
WebSocket.

**Historial como persistencia.** El backfill de Portal entrega las últimas 24
horas al conectar. Esto reemplaza por completo una base de datos: el estado
vive en el canal.

**Presencia.** `presence.count` muestra cuántas personas están viendo el mapa
en ese momento.

---

## Capacidad de IA

El agente de verificación cruzada recibe los eventos crudos y:

1. **Traduce la jerga técnica a lenguaje que cualquier vecino entiende.**
   `INCENDIO / ESTRUCTURAS / VIVIENDA / MATERIAL NOBLE`
   → `Incendio en vivienda de material noble`

2. **Cruza fuentes** para detectar cuándo varias reportan el mismo incidente.

3. **Valida coordenadas** y marca los eventos que el parte oficial registró
   sin ubicación GPS.

**Modo de respaldo.** Si la API falla o se agotan los créditos, el pipeline
cae automáticamente a clasificación por reglas. El mapa nunca se queda vacío
ni muestra datos desactualizados. Esto no es un parche: es tolerancia a fallos
en un sistema que muestra información de emergencias.

### Gravedad calculada, no opinada

La relevancia de cada evento **no** la decide el modelo. Se calcula en el
backend a partir de un dato objetivo del parte oficial: **cuántas unidades
movilizó Bomberos**. Tres o más significa que el despacho escaló la
emergencia. Ese criterio ya lo tomó un profesional en el momento del
incidente — nosotros solo lo leemos.

Es una decisión de diseño deliberada: no se le pide a una IA que opine sobre
algo que ya está medido.

---

## Stack

**Backend** — Node.js 24, Express 5, Cheerio, API de Anthropic (fetch directo)
**Frontend** — React 19, Vite, Leaflet, Tailwind CSS 4, @portalsdk/react
**Tiempo real** — Portal (useportal.co)
**Deploy** — Railway (backend), Vercel (frontend)

Sin base de datos. Sin autenticación. Sin dependencias innecesarias.

---

## Funcionalidades

- Mapa de los 43 distritos de Lima Metropolitana
- Marcadores por tipo con glifos e indicador de gravedad
- Filtros por tipo de emergencia y por gravedad
- Parte de despacho con N° de parte oficial, hora y unidades movilizadas
- Panel de estadísticas: distribución por tipo y ranking de distritos
- PWA instalable en el celular
- Ubicación del usuario en el mapa
- Presencia en vivo de usuarios conectados

---

## Correr localmente

```bash
git clone https://github.com/rosalesdev928/radar.git
cd radar

# Backend
cd backend
npm install
cp .env.example .env    # completa tus keys
npm start

# Frontend (otra terminal)
cd frontend
npm install
cp .env.example .env    # completa tus keys
npm run dev
```

Necesitas keys de [Portal](https://useportal.co) y de
[Anthropic](https://console.anthropic.com).

---

## Fuente de datos

Cuerpo General de Bomberos Voluntarios del Perú — reporte público de
emergencias de las últimas 24 horas:
https://sgonorte.bomberosperu.gob.pe/24horas

Es una fuente oficial del Estado peruano, pública y sin restricciones de
acceso automatizado.

---

## Próximos pasos

**Más fuentes oficiales.** El agente de verificación cruzada está diseñado
para múltiples fuentes, pero hoy solo consume Bomberos. Se evaluaron PNP y
ATU sin éxito: la API de X pasó a modelo de pago por uso en febrero de 2026
(~US$90 para la ventana del hackathon), los portales institucionales en
gob.pe devuelven 418 ante acceso automatizado, y el portal propio de ATU lo
prohíbe explícitamente en su robots.txt. Queda pendiente encontrar una vía
de acceso viable.

**Agente analista de patrones.** Un segundo agente que revise el flujo
completo cada 10 minutos y detecte concentraciones anómalas —
_"tres incendios en San Juan de Lurigancho en dos horas"_ — publicando a un
canal de alertas separado.

**Notificaciones por distrito.** Usando el inbox de Portal, para que un
vecino reciba aviso solo de lo que pasa cerca.

**Reportes ciudadanos** verificados contra las fuentes oficiales.

---

## Nota

Radar no reemplaza al 116. Ante una emergencia, llama.

---

Construido por [José Leonardo Rosales Gutiérrez](https://github.com/rosalesdev928)
