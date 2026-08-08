import { COLORES, ETIQUETAS, svgDe } from './iconos';
import { DISTRITOS } from './alertas';
import { ABREV, fechaHora } from './formato';

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
export function Estadisticas({ eventos }) {
  const porTipo = TIPOS.map((t) => ({
    tipo: t,
    n: eventos.filter((e) => e.tipo === t).length,
  }))
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n);

  const max = Math.max(1, ...porTipo.map((x) => x.n));

  const porDistrito = Object.entries(
    eventos.reduce((m, e) => ({ ...m, [e.distrito]: (m[e.distrito] || 0) + 1 }), {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

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

      <div>
        <h3 className="display text-[12px] text-[#7C8AA0] mb-2.5">
          Distritos con más emergencias
        </h3>
        <ul className="space-y-1.5">
          {porDistrito.map(([d, n], i) => (
            <li key={d} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="dato text-[10px] text-[#4A5568] w-4">{i + 1}</span>
              <span className="flex-1 text-slate-300 truncate">{d}</span>
              <span className="dato text-slate-400">{n}</span>
            </li>
          ))}
        </ul>
      </div>

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