import { useEffect, useMemo, useRef, useState } from 'react';
import { Portal } from '@portalsdk/core';
import { PortalProvider, useChannel } from '@portalsdk/react';
import Mapa from './Mapa';
import ChatEvento from './ChatEvento';
import { Filtros, Listado, Estadisticas, Ajustes } from './paneles';
import { leerUsuario, guardarUsuario, borrarUsuario, esModoApp } from './usuario';
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

  return (
    <div className="h-full w-full flex flex-col justify-center px-7 max-w-md mx-auto bg-[#0B1120]
                    pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="dato text-[10px] tracking-[0.25em] text-[#FF3B30] mb-2">
        EMERGENCIAS 116
      </div>
      <h1 className="display text-[54px] leading-[0.9] font-bold mb-3">Radar</h1>
      <p className="text-[14px] text-[#7C8AA0] leading-relaxed mb-9">
        Emergencias reales de Lima Metropolitana, en el mapa, mientras ocurren.
        Datos oficiales del Cuerpo General de Bomberos del Perú.
      </p>

      <label className="dato text-[10px] tracking-wider text-[#7C8AA0] mb-2 block">
        TU NOMBRE
      </label>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value.slice(0, 20))}
        onKeyDown={(e) => e.key === 'Enter' && nombre.trim() && onEntrar(nombre.trim())}
        placeholder="Cómo te vean los demás"
        className="w-full bg-[#161F2F] border border-white/10 rounded-xl px-4 py-3.5 text-[15px]
                   placeholder:text-[#4A5568] outline-none focus:border-[#FF3B30]/60 transition"
      />

      <button
        onClick={() => nombre.trim() && onEntrar(nombre.trim())}
        disabled={!nombre.trim()}
        className="mt-3 w-full bg-[#FF3B30] disabled:bg-[#2A3547] disabled:text-[#7C8AA0]
                   text-white display font-bold text-[16px] py-3.5 rounded-xl transition"
      >
        Entrar al mapa
      </button>

      <button
        onClick={() => onEntrar(null)}
        className="mt-2.5 w-full text-[#7C8AA0] text-[13px] py-2 hover:text-slate-300 transition"
      >
        Entrar sin nombre
      </button>

      {instalable && !esModoApp() && (
        <button
          onClick={onInstalar}
          className="mt-7 w-full border border-white/15 text-slate-300 text-[13px] py-3 rounded-xl
                     hover:bg-white/5 transition"
        >
          Instalar Radar en este dispositivo
        </button>
      )}
    </div>
  );
}

/* ---------- Vista principal ---------- */
function Vista({ usuario, onSalir, instalable, onInstalar }) {
  const [seccion, setSeccion] = useState('mapa');
  const [filtro, setFiltro] = useState('todos');
  const [mostrarCerrados, setMostrarCerrados] = useState(true);
  const [seleccionado, setSeleccionado] = useState(null);
  const [chat, setChat] = useState(null);

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
    <PortalProvider client={portal}>
      <Vista
        usuario={sesion.usuario}
        onSalir={salir}
        instalable={instalable}
        onInstalar={instalar}
      />
    </PortalProvider>
  );
}