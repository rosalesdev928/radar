import { useMemo, useState } from 'react';
import { useChannel } from '@portalsdk/react';

const CANAL = `${import.meta.env.VITE_CIUDAD || 'radar'}:alertas`;
const VIGENCIA_MIN = 90; // pasado esto, una alerta deja de mostrarse

const NIVELES = {
  atencion: { color: '#FF7A29', etiqueta: 'Atención' },
  informativo: { color: '#35A7FF', etiqueta: 'Patrón detectado' },
};

/**
 * Alertas del vigilante: el agente que corre solo, mira el conjunto de la
 * ciudad y avisa cuando encuentra un patrón que nadie vería mirando 90 pines.
 *
 * Canal propio y no la bandeja: esto es para toda la ciudad, no dirigido a un
 * usuario. Cualquiera que abra Radar lo ve, esté suscrito o no.
 */
export default function AlertasVigilante({ onVerEventos }) {
  const [ocultas, setOcultas] = useState(() => new Set());

  const { messages } = useChannel(
    useMemo(() => ({ channelId: CANAL, history: 20 }), [])
  );

  const vigentes = useMemo(() => {
    const corte = Date.now() - VIGENCIA_MIN * 60000;
    const porClave = new Map();

    for (const m of messages) {
      const a = m.content;
      if (a?.tipo !== 'vigilante' || !a.titulo) continue;
      if ((a.ts ?? 0) < corte) continue;
      // Si el vigilante repite un patrón, gana el más reciente
      porClave.set(`${a.clase}:${a.distrito ?? ''}`, { ...a, _id: m.id });
    }

    return [...porClave.values()]
      .filter((a) => !ocultas.has(a._id))
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  }, [messages, ocultas]);

  if (!vigentes.length) return null;

  return (
    <div className="px-4 py-2.5 space-y-2 border-b border-white/5">
      {vigentes.map((a) => {
        const n = NIVELES[a.nivel] ?? NIVELES.informativo;

        return (
          <div
            key={a._id}
            className="rounded-xl border bg-[#131C2C] overflow-hidden"
            style={{ borderColor: `${n.color}44` }}
          >
            <div className="flex">
              <span className="w-[3px] shrink-0" style={{ background: n.color }} />

              <div className="flex-1 min-w-0 px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke={n.color} strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    className="w-[13px] h-[13px] shrink-0"
                  >
                    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z" />
                  </svg>
                  <span
                    className="display text-[10px] font-bold tracking-wide"
                    style={{ color: n.color }}
                  >
                    {n.etiqueta}
                  </span>
                  {a.distrito && (
                    <span className="dato text-[9px] text-[#7C8AA0]">· {a.distrito}</span>
                  )}

                  <button
                    onClick={() => setOcultas((s) => new Set(s).add(a._id))}
                    className="ml-auto -mr-1 w-6 h-6 grid place-items-center rounded-full
                               text-[#4A5568] hover:text-slate-300 hover:bg-white/5 transition"
                    aria-label="Ocultar"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <p className="text-[12.5px] text-slate-100 leading-snug font-medium">
                  {a.titulo}
                </p>
                <p className="text-[11.5px] text-slate-300/85 leading-snug mt-0.5">
                  {a.detalle}
                </p>

                <div className="flex items-center gap-2 mt-1.5">
                  <span className="dato text-[9px] text-[#4A5568]">
                    detectado por IA
                  </span>
                  {a.eventos?.length > 0 && onVerEventos && (
                    <button
                      onClick={() => onVerEventos(a.eventos)}
                      className="dato text-[9px] text-[#7C8AA0] hover:text-slate-300 transition"
                    >
                      ver los {a.eventos.length} partes
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}