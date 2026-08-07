import { useEffect, useMemo, useRef, useState } from 'react';
import { useChannel } from '@portalsdk/react';
import { COLORES, ETIQUETAS } from './iconos';
import { idDispositivo } from './usuario';

const LIMITE = 240;
const BACKEND = import.meta.env.VITE_BACKEND_URL;

const VEREDICTOS = {
  corroborado:   { texto: 'Corroborado por vecinos', color: '#22C55E' },
  ampliado:      { texto: 'Vecinos aportan datos nuevos', color: '#35A7FF' },
  contradictorio:{ texto: 'Contradice el parte oficial', color: '#FFB020' },
  sin_confirmar: { texto: 'Sin confirmar', color: '#7C8AA0' },
  ruido:         { texto: 'Sin información útil', color: '#7C8AA0' },
};

/* ---------- Votación rápida ---------- */
const OPCIONES_VOTO = [
  {
    clave: 'confirmo',
    texto: 'Lo confirmo',
    color: '#22C55E',
    glifo: <path d="M20 6L9 17l-5-5" />,
  },
  {
    clave: 'nada',
    texto: 'No veo nada',
    color: '#FFB020',
    glifo: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  },
  {
    clave: 'termino',
    texto: 'Ya terminó',
    color: '#7C8AA0',
    glifo: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  },
];

/**
 * Un voto por dispositivo: recorremos en orden y el último gana.
 * Portal serializa las escrituras por canal, así que el orden es fiable.
 *
 * Agrupamos por el id que guarda el propio navegador y NO por m.sender,
 * porque Portal puede dar un sender distinto en cada reconexión y eso
 * hacía que un mismo usuario contara varias veces.
 */
function contarVotos(mensajes) {
  const porDispositivo = new Map();

  for (const m of mensajes) {
    const v = m.content?.voto;
    const d = m.content?.dispositivo;
    // Los votos antiguos sin dispositivo se ignoran: no se pueden deduplicar
    if (!v || !d) continue;
    porDispositivo.set(d, v);
  }

  const conteo = { confirmo: 0, nada: 0, termino: 0 };
  for (const v of porDispositivo.values()) {
    if (v in conteo) conteo[v]++;
  }

  return { conteo, porDispositivo };
}

function BarraVotos({ conteo, miVoto, listos, onVotar }) {
  return (
    <div className="px-4 pt-3">
      <div className="grid grid-cols-3 gap-1.5">
        {OPCIONES_VOTO.map((o) => {
          const activo = miVoto === o.clave;
          const n = conteo[o.clave] ?? 0;

          return (
            <button
              key={o.clave}
              onClick={() => onVotar(o.clave)}
              disabled={!listos}
              className={`flex flex-col items-center gap-1 py-2 rounded-xl border transition
                          disabled:opacity-40 ${
                            activo
                              ? 'bg-white/[0.09] border-white/25'
                              : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                          }`}
              style={activo ? { borderColor: o.color } : undefined}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke={activo ? o.color : '#7C8AA0'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[15px] h-[15px]"
              >
                {o.glifo}
              </svg>
              <span
                className="text-[10.5px] leading-none"
                style={{ color: activo ? o.color : '#94A3B8' }}
              >
                {o.texto}
              </span>
              <span
                className="dato text-[11px] font-bold leading-none"
                style={{ color: n > 0 ? (activo ? o.color : '#CBD5E1') : '#4A5568' }}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {miVoto && (
        <p className="dato text-[9px] text-[#4A5568] text-center mt-1.5">
          tu voto se puede cambiar en cualquier momento
        </p>
      )}
    </div>
  );
}

/* ---------- Lectura del hilo por IA ---------- */
function Analisis({ evento, mensajes, votos }) {
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  const utiles = mensajes.filter((m) => m.content?.texto).length;
  const totalVotos = (votos?.confirmo ?? 0) + (votos?.nada ?? 0) + (votos?.termino ?? 0);

  async function analizar() {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`${BACKEND}/analizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento,
          votos,
          mensajes: mensajes
            .filter((m) => m.content?.texto)
            .map((m) => ({ texto: m.content.texto, nombre: m.content.nombre })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.mensaje || 'No se pudo analizar el hilo');
      setDatos(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  // Basta con dos reportes escritos, o con tres personas que hayan votado
  if (utiles < 2 && totalVotos < 3) return null;

  const etiquetaBoton =
    utiles >= 2
      ? `Resumir estos ${utiles} reportes`
      : `Leer ${totalVotos} señales de vecinos`;

  if (!datos) {
    return (
      <div className="px-4 pt-3">
        <button
          onClick={analizar}
          disabled={cargando}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                     bg-white/[0.06] hover:bg-white/[0.11] border border-white/10
                     text-[12.5px] text-slate-200 transition disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
               strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
            <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z" />
          </svg>
          {cargando ? 'Leyendo el hilo…' : etiquetaBoton}
        </button>
        {error && (
          <p className="text-[11px] text-amber-400/90 mt-1.5 text-center">{error}</p>
        )}
      </div>
    );
  }

  const v = VEREDICTOS[datos.veredicto] ?? VEREDICTOS.sin_confirmar;

  return (
    <div className="px-4 pt-3">
      <div className="rounded-xl border border-white/10 bg-[#131C2C] p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: v.color }} />
          <span className="display text-[11px] font-bold" style={{ color: v.color }}>
            {v.texto}
          </span>
          <span className="dato text-[9px] text-[#4A5568] ml-auto">
            confianza {datos.confianza}
          </span>
        </div>

        <p className="text-[12.5px] text-slate-200 leading-snug">{datos.resumen}</p>

        {datos.datos_nuevos?.length > 0 && (
          <ul className="mt-2 space-y-1">
            {datos.datos_nuevos.map((d, i) => (
              <li key={i} className="flex gap-1.5 text-[11.5px] text-slate-300">
                <span className="text-[#35A7FF] shrink-0">+</span>
                {d}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.07]">
          <span className="dato text-[9px] text-[#4A5568]">
            leído por IA · {datos.mensajes_analizados ?? utiles} mensajes
            {totalVotos > 0 && ` · ${totalVotos} votos`}
          </span>
          <button
            onClick={() => setDatos(null)}
            className="dato text-[9px] text-[#7C8AA0] hover:text-slate-300 transition"
          >
            volver a leer
          </button>
        </div>
      </div>
    </div>
  );
}

/** Canal dedicado al hilo de un parte. 'radar:chat:2026027042' */
export function canalDeEvento(id) {
  return `radar:chat:${id}`;
}

function horaCorta(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function Burbuja({ msg, propio }) {
  const nombre = msg.content?.nombre;

  return (
    <div className={`flex flex-col ${propio ? 'items-end' : 'items-start'}`}>
      {!propio && (
        <span className="dato text-[9.5px] text-[#7C8AA0] mb-0.5 px-1">
          {nombre || 'Anónimo'}
        </span>
      )}
      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13.5px] leading-snug ${
          propio
            ? 'bg-[#FF3B30] text-white rounded-br-sm'
            : 'bg-[#1E2940] text-slate-100 rounded-bl-sm'
        } ${msg.status === 'failed' ? 'opacity-40' : ''}`}
      >
        {msg.content?.texto}
      </div>
      <span className="dato text-[9px] text-[#4A5568] mt-0.5 px-1">
        {horaCorta(msg.timestamp)}
        {msg.status === 'pending' && ' · enviando'}
        {msg.status === 'failed' && ' · no se envió'}
      </span>
    </div>
  );
}

export default function ChatEvento({ evento, usuario, onCerrar }) {
  const [texto, setTexto] = useState('');
  const finRef = useRef(null);
  const inputRef = useRef(null);

  const metadata = useMemo(
    () => (usuario ? { nombre: usuario } : undefined),
    [usuario]
  );

  const opciones = useMemo(
    () => ({
      channelId: evento ? canalDeEvento(evento.id) : undefined,
      history: 100,
      metadata,
    }),
    [evento, metadata]
  );

  const { messages, send, status, presence, typing, sendTyping, me } =
    useChannel(opciones);

  const listos = status === 'ready';
  const viendo = presence?.count ?? 0;

  /* Identidad estable de este navegador, para no contar votos repetidos */
  const miDispositivo = useMemo(() => idDispositivo(), []);

  /* Votos y conversación viven en el mismo canal; los separamos aquí */
  const { conteo, porDispositivo } = useMemo(() => contarVotos(messages), [messages]);
  const conversacion = useMemo(
    () => messages.filter((m) => m.content?.texto),
    [messages]
  );
  const votoCrudo = porDispositivo.get(miDispositivo) ?? null;
  const miVoto = votoCrudo && votoCrudo !== 'ninguno' ? votoCrudo : null;

  /* Auto-scroll al último mensaje */
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversacion.length, typing.length]);

  /* Foco al abrir (solo escritorio, en móvil el teclado tapa el mapa) */
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      inputRef.current?.focus();
    }
  }, [evento?.id]);

  /* Cerrar con Escape */
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCerrar]);

  if (!evento) return null;

  const color = COLORES[evento.tipo] ?? COLORES.otro;

  async function votar(clave) {
    if (!listos) return;
    // Pulsar el voto que ya tienes lo retira
    const valor = miVoto === clave ? 'ninguno' : clave;
    try {
      await send({
        content: {
          voto: valor,
          dispositivo: miDispositivo,
          nombre: usuario || null,
        },
      });
    } catch {
      /* si falla, el conteo simplemente no cambia */
    }
  }

  async function enviar() {
    const limpio = texto.trim();
    if (!limpio || !listos) return;

    setTexto('');
    try {
      await send({
        content: { texto: limpio, nombre: usuario || null },
      });
    } catch {
      setTexto(limpio); // devolvemos el texto para que no se pierda
    }
  }

  return (
    <>
      {/* Fondo oscuro */}
      <div
        onClick={onCerrar}
        className="fixed inset-0 z-[1400] bg-black/50 lg:bg-black/20"
      />

      {/* Panel: hoja inferior en móvil, lateral en escritorio */}
      <section
        className="fixed z-[1500] bg-[#0B1120] flex flex-col
                   inset-x-0 bottom-0 h-[78vh] rounded-t-2xl border-t border-white/15
                   lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:w-[380px]
                   lg:rounded-none lg:border-t-0 lg:border-l"
      >
        {/* Agarradera (móvil) */}
        <div className="lg:hidden pt-2 pb-1 grid place-items-center shrink-0">
          <span className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Cabecera */}
        <header className="px-4 pt-2 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className="display text-[11px] font-bold mb-0.5"
                style={{ color }}
              >
                {ETIQUETAS[evento.tipo] ?? 'Otro'}
                {evento.estado === 'atendiendo' && ' · en curso'}
              </div>
              <p className="text-[13px] text-slate-100 leading-snug truncate">
                {evento.descripcion}
              </p>
              <p className="dato text-[10px] text-[#7C8AA0] mt-0.5">
                {evento.distrito} · PARTE {evento.id}
              </p>
            </div>

            <button
              onClick={onCerrar}
              className="shrink-0 w-8 h-8 grid place-items-center rounded-full
                         text-[#7C8AA0] hover:text-white hover:bg-white/5 transition"
              aria-label="Cerrar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" className="w-[18px] h-[18px]">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2 mt-2.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                listos ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="dato text-[9.5px] text-[#7C8AA0]">
              {listos
                ? viendo > 0
                  ? `${viendo} en este hilo`
                  : 'hilo abierto'
                : 'conectando…'}
            </span>
          </div>
        </header>

        <BarraVotos
          conteo={conteo}
          miVoto={miVoto}
          listos={listos}
          onVotar={votar}
        />

        <Analisis evento={evento} mensajes={messages} votos={conteo} />

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 flex flex-col gap-2.5">
          {!conversacion.length && listos && (
            <div className="flex-1 grid place-items-center text-center px-6">
              <div>
                <p className="text-[13px] text-[#7C8AA0] leading-relaxed">
                  Nadie ha escrito todavía.
                </p>
                <p className="text-[11.5px] text-[#4A5568] mt-1.5 leading-relaxed">
                  Si estás cerca, cuenta qué ves. Lo que escribas aquí ayuda a
                  quien viene detrás.
                </p>
              </div>
            </div>
          )}

          {conversacion.map((m) => (
            <Burbuja key={m.id} msg={m} propio={me?.id && m.sender === me.id} />
          ))}

          {typing.length > 0 && (
            <div className="flex items-center gap-1.5 px-1">
              <span className="flex gap-1">
                <i className="w-1.5 h-1.5 rounded-full bg-[#7C8AA0] animate-bounce"
                   style={{ animationDelay: '0ms' }} />
                <i className="w-1.5 h-1.5 rounded-full bg-[#7C8AA0] animate-bounce"
                   style={{ animationDelay: '150ms' }} />
                <i className="w-1.5 h-1.5 rounded-full bg-[#7C8AA0] animate-bounce"
                   style={{ animationDelay: '300ms' }} />
              </span>
              <span className="dato text-[9.5px] text-[#7C8AA0]">
                alguien está escribiendo
              </span>
            </div>
          )}

          <div ref={finRef} />
        </div>

        {/* Escribir */}
        <div className="shrink-0 border-t border-white/10 px-3 py-2.5
                        pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={texto}
              disabled={!listos}
              onChange={(e) => {
                setTexto(e.target.value.slice(0, LIMITE));
                sendTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder={listos ? 'Qué está pasando aquí…' : 'Conectando…'}
              className="flex-1 resize-none bg-[#161F2F] border border-white/10 rounded-xl
                         px-3.5 py-2.5 text-[14px] leading-snug max-h-28
                         placeholder:text-[#4A5568] outline-none
                         focus:border-[#FF3B30]/60 transition disabled:opacity-50"
            />
            <button
              onClick={enviar}
              disabled={!texto.trim() || !listos}
              className="shrink-0 w-10 h-10 rounded-xl grid place-items-center transition
                         bg-[#FF3B30] disabled:bg-[#2A3547] disabled:text-[#7C8AA0] text-white"
              aria-label="Enviar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="w-[18px] h-[18px]">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>

          {texto.length > LIMITE - 60 && (
            <div className="dato text-[9px] text-[#4A5568] text-right mt-1 pr-12">
              {LIMITE - texto.length}
            </div>
          )}
        </div>
      </section>
    </>
  );
}