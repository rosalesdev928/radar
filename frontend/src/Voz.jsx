import { useCallback, useEffect, useRef, useState } from 'react';
import { distancia, coordsDe } from './ubicacion';

const BACKEND = import.meta.env.VITE_BACKEND_URL;

/* Alcance de la consulta hablada. Más amplio que el radio de avisos: si
   preguntas "qué hay cerca", te interesa un poco más que tus dos cuadras. */
const RADIO_CONSULTA = 5000;

function reconocedor() {
  const C = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!C) return null;
  const r = new C();
  r.lang = 'es-PE';
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

export function hayVoz() {
  return Boolean(
    (window.SpeechRecognition || window.webkitSpeechRecognition) &&
      window.speechSynthesis
  );
}

/**
 * Consulta hablada sobre el entorno.
 *
 * Todo el reconocimiento y la síntesis corren en el navegador — no hay
 * servicio de transcripción ni coste por audio. Al backend solo viaja el
 * texto y las distancias ya calculadas: la posición nunca sale del
 * dispositivo.
 */
export default function Voz({ eventos, posicion, contexto, onMencionar }) {
  const [estado, setEstado] = useState('listo'); // listo | oyendo | pensando | hablando
  const [transcripcion, setTranscripcion] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [error, setError] = useState(null);

  const recRef = useRef(null);
  const finalRef = useRef('');
  const desbloqueadoRef = useRef(false);

  const decir = useCallback((texto) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-PE';
    u.rate = 1.03; // apenas por encima de lo normal: suena atento, no acelerado
    u.pitch = 1;

    // Preferimos una voz en español si el sistema la tiene
    const voces = window.speechSynthesis.getVoices();
    const es = voces.find((v) => v.lang?.startsWith('es'));
    if (es) u.voice = es;

    u.onend = () => setEstado('listo');
    u.onerror = () => setEstado('listo');

    setEstado('hablando');
    window.speechSynthesis.speak(u);
  }, []);

  const consultar = useCallback(
    async (pregunta) => {
      setEstado('pensando');
      setError(null);

      // Qué tiene cerca, resuelto aquí: al servidor solo van ids y distancias
      let cercanos = [];
      if (posicion) {
        cercanos = eventos
          .map((e) => {
            const c = coordsDe(e);
            if (!c) return null;
            const m = distancia(posicion[0], posicion[1], c[0], c[1]);
            return m <= RADIO_CONSULTA ? { id: e.id, metros: m } : null;
          })
          .filter(Boolean)
          .sort((a, b) => a.metros - b.metros)
          .slice(0, 12);
      }

      /* Además de lo cercano, un índice de TODA la ciudad agrupado por
         distrito. Sin esto, preguntar "¿hay algo en Lince?" desde Villa El
         Salvador daba "no hay nada" — y era falso: el evento existía, pero
         estaba a 20 km y el filtro de proximidad lo había descartado. */
      const porDistrito = {};
      for (const e of eventos) {
        if (!e.distrito) continue;
        (porDistrito[e.distrito] ??= []).push({
          tipo: e.tipo,
          descripcion: e.descripcion,
          gravedad: e.relevancia,
          estado: e.estado,
          hora: e.hora,
        });
      }

      try {
        const r = await fetch(`${BACKEND}/voz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pregunta, cercanos, porDistrito, contexto }),
        });

        const j = await r.json();
        if (!r.ok) throw new Error(j.mensaje || 'No pude responder');

        setRespuesta(j.respuesta);
        onMencionar?.(j.mencionados ?? []);
        decir(j.respuesta);
      } catch (e) {
        setError(e.message);
        setEstado('listo');
      }
    },
    [eventos, posicion, contexto, decir, onMencionar]
  );

  /**
   * iOS solo permite hablar si `speak()` nace de un gesto del usuario. El
   * nuestro ocurre después del fetch, cuando Safari ya perdió ese contexto.
   * Lanzar aquí una locución muda —dentro del toque— deja el motor
   * desbloqueado para el resto de la sesión.
   */
  const desbloquearVoz = useCallback(() => {
    if (desbloqueadoRef.current || !window.speechSynthesis) return;
    try {
      const mudo = new SpeechSynthesisUtterance(' ');
      mudo.volume = 0;
      window.speechSynthesis.speak(mudo);
      desbloqueadoRef.current = true;
    } catch {
      /* si no se puede, seguimos: en escritorio no hace falta */
    }
  }, []);

  const escuchar = useCallback(() => {
    desbloquearVoz();

    // Si está hablando, el toque la calla: nadie quiere esperar a que termine
    if (estado === 'hablando') {
      window.speechSynthesis.cancel();
      setEstado('listo');
      return;
    }

    if (estado === 'oyendo') {
      recRef.current?.stop();
      return;
    }

    const r = reconocedor();
    if (!r) {
      setError('Este navegador no reconoce voz.');
      return;
    }

    finalRef.current = '';
    setTranscripcion('');
    setRespuesta('');
    setError(null);
    recRef.current = r;

    r.onstart = () => setEstado('oyendo');

    r.onresult = (ev) => {
      let texto = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        texto += ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalRef.current += ev.results[i][0].transcript;
      }
      setTranscripcion(finalRef.current || texto);
    };

    r.onerror = (ev) => {
      setEstado('listo');
      if (ev.error === 'not-allowed') setError('Permiso de micrófono denegado.');
      else if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        setError('No pude escucharte, intenta de nuevo.');
      }
    };

    r.onend = () => {
      const dicho = finalRef.current.trim();
      if (dicho) consultar(dicho);
      else setEstado('listo');
    };

    try {
      r.start();
    } catch {
      setEstado('listo');
    }
  }, [estado, consultar, desbloquearVoz]);

  /* El navegador carga las voces de forma asíncrona; sin esto, la primera
     consulta puede salir con la voz por defecto en inglés. */
  useEffect(() => {
    window.speechSynthesis?.getVoices();
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.abort?.();
      window.speechSynthesis?.cancel();
    };
  }, []);

  if (!hayVoz()) return null;

  const oyendo = estado === 'oyendo';
  const pensando = estado === 'pensando';
  const hablando = estado === 'hablando';

  return (
    <>
      {/* Panel de conversación */}
      {(transcripcion || respuesta || error) && (
        <div
          className="absolute z-[900] left-3 right-3 bottom-[14rem] lg:left-auto lg:right-4
                     lg:w-[340px] rounded-2xl border border-white/12 bg-[#0B1120]/95
                     backdrop-blur-md shadow-2xl shadow-black/60 px-4 py-3"
        >
          {transcripcion && (
            <p className="text-[12px] text-[#7C8AA0] leading-snug mb-1.5">
              “{transcripcion}”
            </p>
          )}

          {pensando && (
            <p className="text-[13px] text-slate-300 flex items-center gap-1.5">
              <span className="flex gap-1">
                <i className="w-1.5 h-1.5 rounded-full bg-[#35A7FF] animate-bounce"
                   style={{ animationDelay: '0ms' }} />
                <i className="w-1.5 h-1.5 rounded-full bg-[#35A7FF] animate-bounce"
                   style={{ animationDelay: '150ms' }} />
                <i className="w-1.5 h-1.5 rounded-full bg-[#35A7FF] animate-bounce"
                   style={{ animationDelay: '300ms' }} />
              </span>
              revisando la zona
            </p>
          )}

          {respuesta && (
            <p className="text-[13.5px] text-slate-100 leading-relaxed">{respuesta}</p>
          )}

          {error && <p className="text-[12.5px] text-amber-400/90">{error}</p>}

          {hablando && (
            <p className="dato text-[9px] text-[#4A5568] mt-1.5">
              toca el micrófono para callar
            </p>
          )}
        </div>
      )}

      {/* Micrófono */}
      <button
        onClick={escuchar}
        disabled={pensando}
        aria-label="Preguntar por voz"
        className={`absolute z-[900] right-4 bottom-[10.5rem] w-12 h-12 rounded-full grid
                    place-items-center shadow-lg shadow-black/50 transition
                    disabled:opacity-60 ${
                      oyendo
                        ? 'bg-[#FF3B30] text-white scale-110'
                        : hablando
                          ? 'bg-[#35A7FF] text-white'
                          : 'bg-[#161F2F] text-slate-200 border border-white/15 hover:bg-[#1E2940]'
                    }`}
      >
        {oyendo && (
          <span className="absolute inset-0 rounded-full bg-[#FF3B30] animate-ping opacity-40" />
        )}

        {hablando ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" className="w-5 h-5 relative">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 relative">
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 10v1a7 7 0 0014 0v-1M12 18v4" />
          </svg>
        )}
      </button>
    </>
  );
}