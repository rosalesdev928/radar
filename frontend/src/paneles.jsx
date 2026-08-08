import { useMemo } from 'react';
import { COLORES, ETIQUETAS, svgDe } from './iconos';
import { DISTRITOS } from './alertas';
import { TEMAS } from './tema';
import { ABREV, fechaHora, aFecha } from './formato';

const TIPOS = [
  'incendio',
  'emergencia_medica',
  'accidente_vehicular',
  'rescate',
  'materiales_peligrosos',
  'transito',
];

/* ---------- Filtros ---------- */
export function Filtros({ eventos, activo, onCambiar }) {
  const conteo = eventos.reduce((m, e) => ({ ...m, [e.tipo]: (m[e.tipo] || 0) + 1 }), {});
  const presentes = TIPOS.filter((t) => conteo[t]);
  const graves = eventos.filter((e) => e.relevancia === 'alta').length;

  return (
    <div className="sin-barra flex gap-1.5 overflow-x-auto px-3 py-2 [&>*:last-child]:mr-3">
      <Chip activo={activo === 'todos'} onClick={() => onCambiar('todos')} color="#E8EDF5">
        Todos <span className="opacity-60">{eventos.length}</span>
      </Chip>

      {graves > 0 && (
        <Chip activo={activo === 'graves'} onClick={() => onCambiar('graves')} color="#FFB020">
          Graves <span className="opacity-60">{graves}</span>
        </Chip>
      )}

      {presentes.map((t) => (
        <Chip key={t} activo={activo === t} onClick={() => onCambiar(t)} color={COLORES[t]}>
          {ABREV[t]} <span className="opacity-60">{conteo[t]}</span>
        </Chip>
      ))}
    </div>
  );
}

function Chip({ children, activo, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 display text-[12.5px] font-bold px-3.5 py-1.5 rounded-full border transition"
      style={{
        background: activo ? color : 'rgba(11,17,32,.85)',
        color: activo ? '#0B1120' : color,
        borderColor: activo ? color : 'rgba(255,255,255,.14)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {children}
    </button>
  );
}

/* ---------- Listado ---------- */
export function Listado({ eventos, onSeleccionar, nuevos }) {
  if (!eventos.length)
    return (
      <p className="px-4 py-10 text-center text-[12px] text-[#7C8AA0]">
        No hay emergencias de este tipo en las últimas 24 horas.
      </p>
    );

  return (
    <ul className="divide-y divide-white/5">
      {eventos.map((e) => {
        const color = COLORES[e.tipo] ?? COLORES.otro;
        const activo = e.estado === 'atendiendo';
        const ubicable = e.coordenadas_validas;
        const esNuevo = nuevos?.has(e.id);
        const grave = e.relevancia === 'alta';

        return (
          <li key={e.id}>
            <button
              onClick={() => ubicable && onSeleccionar?.(e)}
              disabled={!ubicable}
              className={`w-full text-left px-4 py-3 flex gap-3 items-start transition
                          ${esNuevo ? 'fila-nueva' : ''}
                          ${ubicable ? 'hover:bg-white/[0.04] active:bg-white/[0.07]' : 'cursor-default'}`}
            >
              <span
                className="mt-0.5 shrink-0 w-7 h-7 rounded-full grid place-items-center"
                style={{
                  background: activo ? color : 'transparent',
                  color: activo ? '#fff' : color,
                  boxShadow: activo ? 'none' : `inset 0 0 0 1.5px ${color}`,
                }}
                dangerouslySetInnerHTML={{
                  __html: svgDe(e.tipo).replace('<svg', '<svg style="width:14px;height:14px"'),
                }}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="display text-[11.5px] font-bold" style={{ color }}>
                    {ETIQUETAS[e.tipo] ?? 'Otro'}
                  </span>
                  <span className="text-[10.5px] text-[#7C8AA0]">{e.distrito}</span>

                  {esNuevo && (
                    <span className="dato text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                      NUEVO
                    </span>
                  )}

                  {grave && (
                    <span className="dato text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                      GRAVE
                    </span>
                  )}

                  {activo && (
                    <span className="dato text-[8px] px-1.5 py-0.5 rounded bg-[#FF3B30]/15 text-[#FF3B30]">
                      EN CURSO
                    </span>
                  )}

                  {!ubicable && (
                    <span className="dato text-[8px] text-[#7C8AA0]">SIN GPS</span>
                  )}
                </div>

                <p className="text-[13px] text-slate-200 leading-snug">{e.descripcion}</p>

                <div className="dato text-[9.5px] text-[#7C8AA0] mt-1">
                  {fechaHora(e.hora)} · PARTE {e.id}
                  {e.unidades > 0 && ` · ${e.unidades} und`}
                </div>
              </div>

              {ubicable && (
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className="w-4 h-4 mt-2 shrink-0 text-[#4A5568]"
                >
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Estadísticas ---------- */
/* ---------- Patrones temporales ---------- */

/**
 * Reparto por hora del día. No es decoración: en los datos de Bomberos hay
 * horas punta claras, y verlas cambia la lectura de "hoy hubo muchas".
 */
function RitmoHorario({ eventos }) {
  const { barras, pico } = useMemo(() => {
    const porHora = new Array(24).fill(0);

    for (const e of eventos) {
      const d = aFecha(e.hora);
      if (d) porHora[d.getHours()]++;
    }

    const max = Math.max(1, ...porHora);
    const horaPico = porHora.indexOf(Math.max(...porHora));

    return {
      barras: porHora.map((n, h) => ({ h, n, alto: (n / max) * 100 })),
      pico: { hora: horaPico, n: porHora[horaPico] },
    };
  }, [eventos]);

  const ahora = new Date().getHours();

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <h3 className="display text-[12px] text-[#7C8AA0]">Ritmo del día</h3>
        {pico.n > 0 && (
          <span className="dato text-[9.5px] text-[#4A5568]">
            pico {String(pico.hora).padStart(2, '0')}:00 · {pico.n}
          </span>
        )}
      </div>

      <div className="flex items-end gap-[2px] h-16">
        {barras.map(({ h, n, alto }) => (
          <div key={h} className="flex-1 flex flex-col justify-end h-full group relative">
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.max(alto, n ? 6 : 2)}%`,
                background: h === ahora ? '#FF3B30' : n ? '#35A7FF' : '#1E2940',
                opacity: h === ahora ? 1 : 0.55 + (alto / 100) * 0.45,
              }}
            />
            {n > 0 && (
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 dato text-[9px]
                               text-slate-200 opacity-0 group-hover:opacity-100 transition
                               pointer-events-none whitespace-nowrap">
                {String(h).padStart(2, '0')}h · {n}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between dato text-[8.5px] text-[#4A5568] mt-1">
        <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  );
}

/**
 * Distritos con más carga, cruzados con qué proporción es grave. Un distrito
 * con 12 eventos leves y otro con 5 graves no son comparables por volumen.
 */
function DistritosCalientes({ eventos }) {
  const filas = useMemo(() => {
    const m = new Map();

    for (const e of eventos) {
      if (!e.distrito) continue;
      if (!m.has(e.distrito)) m.set(e.distrito, { total: 0, graves: 0, activos: 0 });
      const d = m.get(e.distrito);
      d.total++;
      if (e.relevancia === 'alta') d.graves++;
      if (e.estado === 'atendiendo') d.activos++;
    }

    return [...m.entries()]
      .map(([distrito, d]) => ({ distrito, ...d, ratio: d.graves / d.total }))
      .sort((a, b) => b.graves - a.graves || b.total - a.total)
      .slice(0, 8);
  }, [eventos]);

  if (!filas.length) return null;
  const max = Math.max(1, ...filas.map((f) => f.total));

  return (
    <div>
      <h3 className="display text-[12px] text-[#7C8AA0] mb-2.5">Distritos con más carga</h3>

      <div className="space-y-1.5">
        {filas.map((f) => (
          <div key={f.distrito} className="flex items-center gap-2.5">
            <span className="text-[11px] text-slate-300 w-[104px] shrink-0 truncate">
              {f.distrito}
            </span>

            {/* La barra completa es el total; la parte roja, lo grave */}
            <div className="flex-1 h-2.5 bg-white/[0.04] rounded-full overflow-hidden flex">
              <div
                className="h-full bg-[#FF3B30]"
                style={{ width: `${(f.graves / max) * 100}%` }}
              />
              <div
                className="h-full bg-[#35A7FF]/45"
                style={{ width: `${((f.total - f.graves) / max) * 100}%` }}
              />
            </div>

            <span className="dato text-[10.5px] text-slate-300 w-11 text-right shrink-0">
              {f.graves > 0 && <span className="text-[#FF3B30]">{f.graves}</span>}
              {f.graves > 0 && <span className="text-[#4A5568]">/</span>}
              {f.total}
            </span>
          </div>
        ))}
      </div>

      <p className="dato text-[9px] text-[#4A5568] mt-2">
        graves / total
      </p>
    </div>
  );
}

export function Estadisticas({ eventos }) {
  const porTipo = TIPOS.map((t) => ({
    tipo: t,
    n: eventos.filter((e) => e.tipo === t).length,
  }))
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n);

  const max = Math.max(1, ...porTipo.map((x) => x.n));

  const sinGps = eventos.filter((e) => !e.coordenadas_validas).length;
  const activos = eventos.filter((e) => e.estado === 'atendiendo').length;
  const graves = eventos.filter((e) => e.relevancia === 'alta').length;

  return (
    <div className="px-4 py-4 space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <Tarjeta valor={eventos.length} etiqueta="Total 24 h" />
        <Tarjeta valor={activos} etiqueta="En curso" color="#FF3B30" />
        <Tarjeta valor={graves} etiqueta="Graves" color="#FFB020" />
      </div>

      <RitmoHorario eventos={eventos} />

      <div>
        <h3 className="display text-[12px] text-[#7C8AA0] mb-2.5">Por tipo</h3>
        <div className="space-y-2">
          {porTipo.map(({ tipo, n }) => (
            <div key={tipo} className="flex items-center gap-2.5">
              <span className="text-[11px] w-20 shrink-0" style={{ color: COLORES[tipo] }}>
                {ABREV[tipo]}
              </span>
              <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(n / max) * 100}%`, background: COLORES[tipo] }}
                />
              </div>
              <span className="dato text-[11px] text-slate-300 w-7 text-right">{n}</span>
            </div>
          ))}
        </div>
      </div>

      <DistritosCalientes eventos={eventos} />

      <div className="border-t border-white/5 pt-4 space-y-2">
        <h3 className="display text-[12px] text-[#7C8AA0]">Cómo se calcula la gravedad</h3>
        <p className="text-[11.5px] text-[#7C8AA0] leading-relaxed">
          A partir de las unidades que Bomberos movilizó al lugar y del tipo de incidente.
          Tres o más unidades indica que el despacho escaló la emergencia.
        </p>
      </div>

      {sinGps > 0 && (
        <p className="text-[11px] text-[#7C8AA0] leading-relaxed border-t border-white/5 pt-4">
          {sinGps} {sinGps === 1 ? 'emergencia no tiene' : 'emergencias no tienen'} coordenadas
          registradas en el parte oficial, por lo que no aparecen en el mapa pero sí en el listado.
        </p>
      )}
    </div>
  );
}

function Tarjeta({ valor, etiqueta, color }) {
  return (
    <div className="bg-[#161F2F] rounded-xl px-3 py-3">
      <div
        className="display text-[24px] leading-none font-bold"
        style={{ color: color ?? '#E8EDF5' }}
      >
        {valor}
      </div>
      <div className="text-[10px] text-[#7C8AA0] mt-1">{etiqueta}</div>
    </div>
  );
}

/* ---------- Ajustes ---------- */

function Interruptor({ activo }) {
  return (
    <span
      className={`w-9 h-5 rounded-full transition relative shrink-0 ${
        activo ? 'bg-emerald-500' : 'bg-[#2A3547]'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
          activo ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </span>
  );
}

export function Ajustes({
  usuario,
  onSalir,
  mostrarCerrados,
  onToggleCerrados,
  instalable,
  onInstalar,
  miDistrito,
  onCambiarDistrito,
  alertas,
  onToggleAlertas,
  permiso,
  registrando,
  errorAviso,
  enBandeja = 0,
  tema = 'oscuro',
  onCambiarTema,
}) {
  const bloqueado = permiso === 'denied';
  const sinSoporte = permiso === 'no-soportado';

  return (
    <div className="px-4 py-4 space-y-5">
      <div>
        <h3 className="display text-[12px] text-[#7C8AA0] mb-2">Sesión</h3>
        <div className="bg-[#161F2F] rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-[14px]">{usuario || 'Sin nombre'}</span>
          <button onClick={onSalir} className="text-[12px] text-[#FF3B30] hover:underline">
            Salir
          </button>
        </div>
      </div>

      {/* ----- Mi zona ----- */}
      <div>
        <h3 className="display text-[12px] text-[#7C8AA0] mb-2">Mi zona</h3>

        <div className="bg-[#161F2F] rounded-xl px-4 py-3">
          <label className="text-[13.5px] block mb-2">Distrito donde estoy</label>
          <select
            value={miDistrito || ''}
            onChange={(e) => onCambiarDistrito(e.target.value || null)}
            className="w-full bg-[#0B1120] border border-white/10 rounded-lg px-3 py-2.5
                       text-[13.5px] outline-none focus:border-[#FF3B30]/60 transition
                       appearance-none cursor-pointer"
          >
            <option value="">Sin elegir</option>
            {DISTRITOS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[#7C8AA0] leading-relaxed mt-2">
            Seguirás viendo toda Lima en el mapa. Esto solo decide de qué zona
            te avisamos.
          </p>
        </div>

        <button
          onClick={onToggleAlertas}
          disabled={!miDistrito || bloqueado || sinSoporte || registrando}
          className="w-full bg-[#161F2F] rounded-xl px-4 py-3 mt-2 flex items-center
                     justify-between disabled:opacity-45"
        >
          <span className="text-[13.5px] text-left">
            {registrando ? 'Registrando…' : 'Avisarme de emergencias aquí'}
          </span>
          <Interruptor activo={alertas} />
        </button>

        {sinSoporte && (
          <p className="text-[11px] text-[#7C8AA0] mt-1.5 px-1 leading-relaxed">
            Este navegador no admite notificaciones. El aviso aparecerá igual
            dentro de la app.
          </p>
        )}

        {bloqueado && (
          <p className="text-[11px] text-amber-400/90 mt-1.5 px-1 leading-relaxed">
            Bloqueaste las notificaciones para este sitio. Habilítalas desde el
            candado de la barra de direcciones para reactivarlas.
          </p>
        )}

        {!miDistrito && !bloqueado && !sinSoporte && (
          <p className="text-[11px] text-[#4A5568] mt-1.5 px-1">
            Elige tu distrito para activar los avisos.
          </p>
        )}

        {errorAviso && (
          <p className="text-[11px] text-[#FF3B30] mt-1.5 px-1 leading-relaxed">
            No se pudo registrar el aviso. {errorAviso}
          </p>
        )}

        {alertas && miDistrito && !errorAviso && (
          <p className="text-[11px] text-emerald-400/80 mt-1.5 px-1 leading-relaxed">
            Registrado. Te avisaremos cuando entre una emergencia en {miDistrito}.
            {enBandeja > 0 && ` Tienes ${enBandeja} sin leer.`}
          </p>
        )}
      </div>

      {/* ----- Mapa ----- */}
      <div>
        <h3 className="display text-[12px] text-[#7C8AA0] mb-2">Mapa</h3>

        <div className="bg-[#161F2F] rounded-xl px-4 py-3 mb-2">
          <span className="text-[13.5px] block mb-2.5">Estilo del mapa</span>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TEMAS).map(([clave, t]) => {
              const activo = tema === clave;
              const oscuro = clave === 'oscuro';
              return (
                <button
                  key={clave}
                  onClick={() => onCambiarTema?.(clave)}
                  className={`rounded-lg border overflow-hidden transition ${
                    activo
                      ? 'border-[#FF3B30] ring-1 ring-[#FF3B30]/40'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <span
                    className="block h-11 w-full"
                    style={{
                      background: oscuro
                        ? 'linear-gradient(135deg,#1B2430 0%,#0E1620 100%)'
                        : 'linear-gradient(135deg,#F4F1EC 0%,#DCE3E8 100%)',
                    }}
                  />
                  <span
                    className={`block text-[11.5px] py-1.5 ${
                      activo ? 'text-slate-100' : 'text-[#7C8AA0]'
                    }`}
                  >
                    {t.nombre}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={onToggleCerrados}
          className="w-full bg-[#161F2F] rounded-xl px-4 py-3 flex items-center justify-between"
        >
          <span className="text-[13.5px] text-left">Mostrar emergencias cerradas</span>
          <Interruptor activo={mostrarCerrados} />
        </button>
      </div>

      {instalable && (
        <button
          onClick={onInstalar}
          className="w-full border border-white/15 text-slate-300 text-[13px] py-3 rounded-xl
                     hover:bg-white/5 transition"
        >
          Instalar Radar en este dispositivo
        </button>
      )}

      <div className="border-t border-white/5 pt-4 space-y-2">
        <h3 className="display text-[12px] text-[#7C8AA0]">Fuente de datos</h3>
        <p className="text-[12px] text-[#7C8AA0] leading-relaxed">
          Cuerpo General de Bomberos Voluntarios del Perú — reporte público de emergencias
          de las últimas 24 horas. Los datos se consultan periódicamente y un agente de IA
          los clasifica antes de mostrarlos.
        </p>
        <p className="text-[11px] text-[#4A5568]">
          Radar no reemplaza al 116. Ante una emergencia, llama.
        </p>
      </div>
    </div>
  );
}