import { useEffect, useMemo, useRef, useState } from 'react';
import { useChannel } from '@portalsdk/react';
import { COLORES, ETIQUETAS } from './iconos';

const LIMITE = 240;

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

  /* Auto-scroll al último mensaje */
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, typing.length]);

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

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 flex flex-col gap-2.5">
          {!messages.length && listos && (
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

          {messages.map((m) => (
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