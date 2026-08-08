import { useEffect, useMemo, useRef, useState } from 'react';
import { Portal } from '@portalsdk/core';
import { PortalProvider, useChannel, useInbox } from '@portalsdk/react';
import Mapa from './Mapa';
import ChatEvento from './ChatEvento';
import { Filtros, Listado, Estadisticas, Ajustes } from './paneles';
import { COLORES, ETIQUETAS } from './iconos';
import { leerUsuario, guardarUsuario, borrarUsuario, esModoApp } from './usuario';
import {
  leerDistrito,
  guardarDistrito,
  leerAlertas,
  guardarAlertas,
  estadoPermiso,
  pedirPermiso,
  notificar,
  normalizar,
} from './alertas';
import { pedirToken, suscribir } from './identidad';
import { leerTema, guardarTema } from './tema';
import Fondo from './fondo';
import AlertasVigilante from './vigilante';
import { aFecha, haceCuanto } from './formato';

const CANAL = import.meta.env.VITE_PORTAL_CHANNEL;
const portal = new Portal({ apiKey: import.meta.env.VITE_PORTAL_KEY });

const SECCIONES = [
  {
    id: 'mapa',
    nombre: 'Mapa',
    icono: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z M9 3v15 M15 6v15',
  },
  {
    id: 'listado',
    nombre: 'Parte',
    icono: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  },
  {
    id: 'stats',
    nombre: 'Datos',
    icono: 'M3 3v18h18 M18 17V9 M13 17V5 M8 17v-3',
  },
  {
    id: 'ajustes',
    nombre: 'Ajustes',
    icono:
      'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6h.09A1.65 1.65 0 0010 3.09V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v.09a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  },
];

/* ---------- Pantalla de entrada ---------- */
function Entrada({ onEntrar, instalable, onInstalar }) {
  const [nombre, setNombre] = useState('');
  const limpio = nombre.trim();

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#080D16]">
      <Fondo />

      {/* Velo para que el texto siempre tenga contraste sobre el fondo vivo */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#080D16]/25 via-[#080D16]/50 to-[#080D16]/80" />

      <div
        className="relative h-full w-full flex flex-col justify-center px-7 max-w-md mx-auto
                   pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] animate-pulse" />
          <span className="dato text-[10px] tracking-[0.25em] text-[#FF3B30]">
            EMERGENCIAS 116
          </span>
        </div>

        <h1 className="display text-[64px] leading-[0.85] font-bold mb-4 tracking-tight">
          Radar
        </h1>

        <p className="text-[14.5px] text-slate-300/90 leading-relaxed mb-9 max-w-[30ch]">
          Emergencias reales de Lima Metropolitana, en el mapa, mientras ocurren.
          Datos oficiales del Cuerpo General de Bomberos del Perú.
        </p>

        <label
          htmlFor="nombre"
          className="dato text-[10px] tracking-wider text-[#7C8AA0] mb-2 block"
        >
          TU NOMBRE
        </label>
        <input
          id="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value.slice(0, 20))}
          onKeyDown={(e) => e.key === 'Enter' && limpio && onEntrar(limpio)}
          placeholder="Cómo te vean los demás"
          autoComplete="off"
          className="w-full bg-white/[0.06] backdrop-blur-md border border-white/15 rounded-xl
                     px-4 py-3.5 text-[15px] placeholder:text-[#4A5568] outline-none
                     focus:border-[#FF3B30]/70 focus:bg-white/[0.09] transition"
        />

        <button
          onClick={() => limpio && onEntrar(limpio)}
          disabled={!limpio}
          className="mt-3 w-full bg-[#FF3B30] hover:bg-[#FF4F45] disabled:bg-white/[0.07]
                     disabled:text-[#7C8AA0] disabled:hover:bg-white/[0.07]
                     text-white display font-bold text-[16px] py-3.5 rounded-xl transition"
        >
          Entrar al mapa
        </button>

        <button
          onClick={() => onEntrar(null)}
          className="mt-2.5 w-full text-[#7C8AA0] text-[13px] py-2 hover:text-slate-200 transition"
        >
          Entrar sin nombre
        </button>

        {instalable && !esModoApp() && (
          <button
            onClick={onInstalar}
            className="mt-7 w-full border border-white/15 bg-white/[0.03] backdrop-blur-md
                       text-slate-300 text-[13px] py-3 rounded-xl hover:bg-white/[0.08] transition"
          >
            Instalar Radar en este dispositivo
          </button>
        )}

        <p className="dato text-[9.5px] text-[#4A5568] text-center mt-7 leading-relaxed">
          Radar no reemplaza al 116. Ante una emergencia, llama.
        </p>
      </div>
    </div>
  );
}

/* ---------- Aviso de emergencia cercana ---------- */
function AvisoCercano({ aviso, onAbrir, onCerrar }) {
  if (!aviso) return null;

  const { evento, extras } = aviso;
  const color = COLORES[evento.tipo] ?? COLORES.otro;

  return (
    <div
      className="aviso-cercano fixed z-[1600] inset-x-3 mx-auto max-w-[420px]
                 top-[max(0.75rem,calc(env(safe-area-inset-top)+0.5rem))]"
    >
      <div
        className="rounded-2xl border bg-[#131C2C]/95 backdrop-blur-md shadow-2xl
                   shadow-black/60 overflow-hidden"
        style={{ borderColor: `${color}55` }}
      >
        <div className="h-[3px] w-full" style={{ background: color }} />

        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
              style={{ background: color }}
            />
            <span className="display text-[10.5px] font-bold tracking-wide" style={{ color }}>
              {ETIQUETAS[evento.tipo] ?? 'Emergencia'} en tu zona
            </span>
            <button
              onClick={onCerrar}
              className="ml-auto -mr-1 w-7 h-7 grid place-items-center rounded-full
                         text-[#7C8AA0] hover:text-white hover:bg-white/5 transition"
              aria-label="Cerrar aviso"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" className="w-[15px] h-[15px]">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-[13.5px] text-slate-100 leading-snug">
            {evento.descripcion}
          </p>

          <p className="dato text-[10px] text-[#7C8AA0] mt-1">
            {evento.distrito}
            {evento.detalle_unidades ? ` · ${evento.detalle_unidades}` : ''}
            {extras > 0 && ` · y ${extras} más`}
          </p>

          <button
            onClick={() => onAbrir(evento)}
            className="w-full mt-2.5 py-2 rounded-lg text-[12.5px] font-medium transition
                       bg-white/[0.07] hover:bg-white/[0.13] border border-white/10
                       text-slate-100"
          >
            Ver en el mapa
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Vista principal ---------- */
function Vista({ usuario, onSalir, instalable, onInstalar }) {
  const [seccion, setSeccion] = useState('mapa');
  const [filtro, setFiltro] = useState('todos');
  const [mostrarCerrados, setMostrarCerrados] = useState(true);
  const [tema, setTema] = useState(() => leerTema());
  const [seleccionado, setSeleccionado] = useState(null);
  const [chat, setChat] = useState(null);

  /* Preferencias de aviso por zona */
  const [miDistrito, setMiDistrito] = useState(() => leerDistrito());
  const [alertas, setAlertas] = useState(() => leerAlertas());
  const [permiso, setPermiso] = useState(() => estadoPermiso());
  const [aviso, setAviso] = useState(null);

  const metadata = useMemo(() => (usuario ? { nombre: usuario } : undefined), [usuario]);
  const opciones = useMemo(
    () => ({ channelId: CANAL, history: 200, metadata }),
    [metadata]
  );

  const { messages, status, presence } = useChannel(opciones);

  const eventos = useMemo(() => {
    const m = new Map();
    for (const msg of messages) if (msg.content?.id) m.set(msg.content.id, msg.content);
    // El N° de parte es secuencial: mayor = más reciente
    return [...m.values()].sort((a, b) => Number(b.id) - Number(a.id));
  }, [messages]);

  /* --- Detección de eventos recién llegados por Portal --- */
  const vistos = useRef(null);
  const [nuevos, setNuevos] = useState(new Set());
  const [, setTick] = useState(0);

  /* Leemos las preferencias por ref para no reejecutar el diff de eventos */
  const prefs = useRef({ distrito: null, alertas: false });
  useEffect(() => {
    prefs.current = { distrito: miDistrito, alertas };
  }, [miDistrito, alertas]);

  useEffect(() => {
    const ids = new Set(eventos.map((e) => e.id));

    if (vistos.current === null) {
      vistos.current = ids;
      return;
    }

    const recien = [...ids].filter((id) => !vistos.current.has(id));
    vistos.current = ids;

    if (recien.length) {
      setNuevos(new Set(recien));
      const t = setTimeout(() => setNuevos(new Set()), 9000);
      return () => clearTimeout(t);
    }
  }, [eventos]);

  useEffect(() => {
    const i = setInterval(() => setTick((v) => v + 1), 20000);
    return () => clearInterval(i);
  }, []);

  /**
   * Los avisos de zona llegan por la bandeja de Portal, no por el diff local:
   * el backend decide a quién le toca y manda un ítem por usuario suscrito.
   * `onItem` dispara una sola vez por ítem — su id es la clave de idempotencia,
   * así que una reentrega no vuelve a sonar.
   */
  const { counter } = useInbox({
    onItem: (item) => {
      if (item.type !== 'radar.emergencia') return;

      const e = item.data ?? {};
      setAviso({ evento: e, extras: 0 });

      if (prefs.current.alertas) {
        notificar({
          titulo: item.title ?? `Emergencia en ${e.distrito ?? 'tu zona'}`,
          cuerpo: e.descripcion ?? '',
          tag: `radar-${e.id ?? item.id}`,
        });
      }
    },
  });

  /* El aviso se retira solo a los 14 s */
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 14000);
    return () => clearTimeout(t);
  }, [aviso]);

  const [registrando, setRegistrando] = useState(false);
  const [errorAviso, setErrorAviso] = useState(null);

  /* Al activar los avisos pedimos permiso: va dentro de un clic del usuario */
  async function alternarAlertas() {
    setErrorAviso(null);

    if (alertas) {
      setAlertas(false);
      guardarAlertas(false);
      setRegistrando(true);
      try {
        await suscribir(null); // baja en el backend
      } catch (e) {
        setErrorAviso(e.message);
      } finally {
        setRegistrando(false);
      }
      return;
    }

    const res = await pedirPermiso();
    setPermiso(res);
    const ok = res === 'granted' || res === 'no-soportado';

    if (!ok) return;

    setRegistrando(true);
    try {
      await suscribir(miDistrito);
      setAlertas(true);
      guardarAlertas(true);
    } catch (e) {
      // Sin registro en el backend no llegaría ningún aviso: no lo damos
      // por activado solo porque el navegador dijo que sí.
      setErrorAviso(e.message);
      setAlertas(false);
      guardarAlertas(false);
    } finally {
      setRegistrando(false);
    }
  }

  function cambiarTema(t) {
    setTema(t);
    guardarTema(t);
  }

  async function cambiarDistrito(d) {
    setMiDistrito(d);
    guardarDistrito(d);
    setErrorAviso(null);

    if (!d) {
      setAlertas(false);
      guardarAlertas(false);
    }

    if (!alertas) return;

    setRegistrando(true);
    try {
      await suscribir(d);
    } catch (e) {
      setErrorAviso(e.message);
    } finally {
      setRegistrando(false);
    }
  }

  const ultimo = eventos.length ? haceCuanto(aFecha(eventos[0].hora)) : null;

  const filtrados =
    filtro === 'todos'
      ? eventos
      : filtro === 'graves'
      ? eventos.filter((e) => e.relevancia === 'alta')
      : eventos.filter((e) => e.tipo === filtro);

  const activos = eventos.filter((e) => e.estado === 'atendiendo').length;
  const enVivo = status === 'ready';
  const viendo = presence?.count ?? 0;
  const verMapa = seccion === 'mapa';

  function irAlMapa(evento) {
    setSeleccionado(evento);
    setSeccion('mapa');
  }

  function cambiarFiltro(nuevo) {
    setFiltro(nuevo);
    setSeleccionado(null);
  }

  const estado = (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-1.5 bg-[#161F2F] px-2.5 py-1 rounded-full">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            enVivo ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
          }`}
        />
        <span className="dato text-[10px] text-slate-300">
          {enVivo ? 'EN VIVO' : status.toUpperCase()}
        </span>
      </div>
      {viendo > 0 && (
        <span className="dato text-[9px] text-[#7C8AA0]">
          {viendo} conectado{viendo === 1 ? '' : 's'}
        </span>
      )}
      {ultimo && (
        <span className="dato text-[9px] text-[#4A5568]">último parte {ultimo}</span>
      )}
    </div>
  );

  const cabecera = (
    <div className="flex items-start justify-between">
      <div>
        <div className="dato text-[9px] tracking-[0.22em] text-[#FF3B30] mb-0.5">
          EMERGENCIAS 116
        </div>
        <h1 className="display text-[26px] leading-none font-bold">Radar</h1>
        <p className="text-[11px] text-[#7C8AA0] mt-0.5">Lima Metropolitana</p>
      </div>
      {estado}
    </div>
  );

  return (
    <div className="h-full w-full flex flex-col bg-[#0B1120]">
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">

        {/* ----- Panel ----- */}
        <aside
          className={`${verMapa ? 'hidden' : 'flex'} lg:flex flex-col min-h-0
                      flex-1 lg:flex-none lg:w-[400px] lg:border-r lg:border-white/10`}
        >
          <div className="px-4 pb-3 border-b border-white/5
                          pt-[max(1rem,env(safe-area-inset-top))] lg:pt-4">{cabecera}</div>

          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`display text-[24px] leading-none font-bold ${
                  activos ? 'text-[#FF3B30]' : 'text-slate-600'
                }`}
              >
                {activos}
              </span>
              <span className="text-[11px] text-[#7C8AA0]">en curso</span>
            </div>
            <span className="w-px h-5 bg-white/10" />
            <div className="flex items-baseline gap-1.5">
              <span className="display text-[24px] leading-none font-bold text-slate-200">
                {eventos.length}
              </span>
              <span className="text-[11px] text-[#7C8AA0]">en 24 h</span>
            </div>
          </div>

          {seccion !== 'ajustes' && <AlertasVigilante />}

          {seccion !== 'ajustes' && (
            <div className="border-b border-white/5">
              <Filtros eventos={eventos} activo={filtro} onCambiar={cambiarFiltro} />
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {seccion === 'listado' && (
              <Listado eventos={filtrados} onSeleccionar={irAlMapa} nuevos={nuevos} />
            )}
            {seccion === 'stats' && <Estadisticas eventos={filtrados} />}
            {seccion === 'ajustes' && (
              <Ajustes
                usuario={usuario}
                onSalir={onSalir}
                mostrarCerrados={mostrarCerrados}
                onToggleCerrados={() => setMostrarCerrados((v) => !v)}
                instalable={instalable}
                onInstalar={onInstalar}
                miDistrito={miDistrito}
                onCambiarDistrito={cambiarDistrito}
                alertas={alertas}
                onToggleAlertas={alternarAlertas}
                permiso={permiso}
                registrando={registrando}
                errorAviso={errorAviso}
                enBandeja={counter}
                tema={tema}
                onCambiarTema={cambiarTema}
              />
            )}
            {verMapa && (
              <Listado eventos={filtrados} onSeleccionar={irAlMapa} nuevos={nuevos} />
            )}
          </div>
        </aside>

        {/* ----- Mapa ----- */}
        <main className={`${verMapa ? 'block' : 'hidden'} lg:block flex-1 min-h-0 relative`}>
          <Mapa
            eventos={filtrados}
            tema={tema}
            mostrarCerrados={mostrarCerrados}
            seccion={seccion}
            seleccionado={seleccionado}
            onLimpiar={() => setSeleccionado(null)}
            nuevos={nuevos}
            onAbrirChat={setChat}
          />

          {/* Cabecera flotante (solo móvil) */}
          <div className="lg:hidden absolute top-0 inset-x-0 z-[1000] pointer-events-none
                          bg-[#0B1120] px-4 pb-3
                          pt-[max(1rem,env(safe-area-inset-top))]">
            {cabecera}
          </div>

          {/* Filtros flotantes (solo móvil) */}
          <div className="lg:hidden absolute bottom-0 inset-x-0 z-[1000] pb-1">
            <Filtros eventos={eventos} activo={filtro} onCambiar={cambiarFiltro} />
          </div>
        </main>
      </div>

      {/* ----- Aviso de emergencia cercana ----- */}
      <AvisoCercano
        aviso={aviso}
        onCerrar={() => setAviso(null)}
        onAbrir={(e) => {
          irAlMapa(e);
          setAviso(null);
        }}
      />

      {/* ----- Hilo del evento ----- */}
      {chat && (
        <ChatEvento
          evento={chat}
          usuario={usuario}
          onCerrar={() => setChat(null)}
        />
      )}

      {/* ----- Navegación móvil ----- */}
      <nav className="lg:hidden shrink-0 h-14 bg-[#0B1120] border-t border-white/10 flex
                      pb-[env(safe-area-inset-bottom)] box-content">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSeccion(s.id)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition"
            style={{ color: seccion === s.id ? '#FF3B30' : '#7C8AA0' }}
          >
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round" className="w-[19px] h-[19px]"
            >
              <path d={s.icono} />
            </svg>
            <span className="text-[9.5px]">{s.nombre}</span>
          </button>
        ))}
      </nav>

      {/* ----- Navegación escritorio ----- */}
      <nav className="hidden lg:flex shrink-0 h-12 border-t border-white/10 bg-[#0B1120]">
        {SECCIONES.filter((s) => s.id !== 'mapa').map((s) => (
          <button
            key={s.id}
            onClick={() => setSeccion(s.id)}
            className="px-5 flex items-center gap-2 transition text-[12px]"
            style={{ color: seccion === s.id ? '#FF3B30' : '#7C8AA0' }}
          >
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"
            >
              <path d={s.icono} />
            </svg>
            {s.nombre}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------- Raíz ---------- */
export default function App() {
  const [sesion, setSesion] = useState(() =>
    leerUsuario() ? { usuario: leerUsuario() } : null
  );
  const [instalable, setInstalable] = useState(null);

  useEffect(() => {
    const h = (e) => {
      e.preventDefault();
      setInstalable(e);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  async function instalar() {
    if (!instalable) return;
    instalable.prompt();
    await instalable.userChoice;
    setInstalable(null);
  }

  function entrar(nombre) {
    if (nombre) guardarUsuario(nombre);
    setSesion({ usuario: nombre });
  }

  function salir() {
    borrarUsuario();
    setSesion(null);
  }

  if (!sesion) {
    return <Entrada onEntrar={entrar} instalable={instalable} onInstalar={instalar} />;
  }

  return (
    <PortalProvider client={portal} token={pedirToken}>
      <Vista
        usuario={sesion.usuario}
        onSalir={salir}
        instalable={instalable}
        onInstalar={instalar}
      />
    </PortalProvider>
  );
}