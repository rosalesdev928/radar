import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import { TEMAS } from './tema';
import L from 'leaflet';
import { svgDe, COLORES, ETIQUETAS } from './iconos';
import { ABREV, fechaHora } from './formato';
 
const CENTRO = [-12.0464, -77.0428];
const ZOOM_ETIQUETAS = 14;
const ZOOM_DETALLE = 16;
 
function iconoEvento(evento, conEtiqueta, esNuevo) {
  const activo = evento.estado === 'atendiendo';
  const color = COLORES[evento.tipo] ?? COLORES.otro;
  const brillo = esNuevo ? 'recien' : '';
  const grave = evento.relevancia === 'alta';
  const leve = evento.relevancia === 'baja';
 
  // Los graves llevan chip aunque estén cerrados
  if (conEtiqueta && (activo || grave)) {
    const texto = ABREV[evento.tipo] ?? 'Otro';
    const ancho = texto.length * 8.2 + 52;
    return L.divIcon({
      className: grave ? 'pin-alta' : '',
      iconSize: [ancho, 34],
      iconAnchor: [ancho / 2, 42],
      popupAnchor: [0, -44],
      html: `<div class="chip ${activo ? 'chip--pulso' : ''} ${brillo}" style="--c:${color}">
               ${svgDe(evento.tipo)}<span>${texto}</span>
             </div>`,
    });
  }
 
  const tam = grave ? 32 : activo ? 28 : 22;
  return L.divIcon({
    className: leve ? 'pin-baja' : grave ? 'pin-alta' : '',
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    popupAnchor: [0, -tam / 2],
    html: `<div class="punto ${activo ? 'punto--activo' : ''} ${grave ? 'aro-grave' : ''} ${brillo}"
                style="--c:${color}">
             ${svgDe(evento.tipo)}
           </div>`,
  });
}
 
function VigilarZoom({ onCambio }) {
  const map = useMapEvents({ zoomend: () => onCambio(map.getZoom()) });
  return null;
}
 
function AjustarTamano({ seccion }) {
  const map = useMap();
 
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 60);
    const t2 = setTimeout(() => map.invalidateSize(), 300);
 
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
 
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
    };
  }, [map, seccion]);
 
  return null;
}
 
function BotonUbicacion({ posicion, onPedir }) {
  const map = useMap();
  return (
    <button
      onClick={() => (posicion ? map.flyTo(posicion, 15) : onPedir())}
      className="absolute right-3 bottom-24 lg:bottom-4 z-[900] w-11 h-11 rounded-full
                 bg-[#0B1120]/95 backdrop-blur border border-white/15 grid place-items-center
                 text-slate-200 hover:text-white transition shadow-lg"
      title="Mi ubicación"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
           className="w-[19px] h-[19px]">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
 
function Marcadores({ eventos, conEtiqueta, seleccionado, onLimpiar, nuevos, onAbrirChat }) {
  const map = useMap();
  const marcadores = useRef({});
 
  useEffect(() => {
    if (!seleccionado?.coordenadas_validas) return;
 
    let cancelado = false;
 
    const iniciar = requestAnimationFrame(() => {
      if (cancelado) return;
      map.invalidateSize();
 
      setTimeout(() => {
        if (cancelado) return;
        map.flyTo([seleccionado.lat, seleccionado.lon], ZOOM_DETALLE, { duration: 0.8 });
 
        setTimeout(() => {
          if (cancelado) return;
          marcadores.current[seleccionado.id]?.openPopup();
          onLimpiar?.();
        }, 850);
      }, 60);
    });
 
    return () => {
      cancelado = true;
      cancelAnimationFrame(iniciar);
    };
  }, [seleccionado, map, onLimpiar]);
 
  return eventos.map((e) => (
    <Marker
      key={e.id}
      position={[e.lat, e.lon]}
      icon={iconoEvento(e, conEtiqueta, nuevos?.has(e.id))}
      ref={(r) => {
        if (r) marcadores.current[e.id] = r;
      }}
      eventHandlers={{
        click: () =>
          map.flyTo([e.lat, e.lon], Math.max(map.getZoom(), ZOOM_DETALLE), { duration: 0.6 }),
      }}
    >
    <Popup>
        <div className="min-w-[215px]">
          <div className="display text-[11.5px] font-bold mb-1.5"
               style={{ color: COLORES[e.tipo] ?? COLORES.otro }}>
            {ETIQUETAS[e.tipo] ?? 'Otro'}
            {e.estado === 'atendiendo' && ' · en curso'}
          </div>
 
          <p className="text-[13px] leading-snug mb-1 text-slate-100">{e.descripcion}</p>
          <p className="text-[11px] text-slate-400 mb-2.5">{e.distrito}</p>
 
          {e.detalle_unidades && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <span
                className="text-[9.5px] px-2 py-0.5 rounded-full display font-bold"
                style={{
                  background: e.relevancia === 'alta' ? '#FF3B30' : 'rgba(255,255,255,.08)',
                  color: e.relevancia === 'alta' ? '#fff' : '#7C8AA0',
                }}
              >
                {e.relevancia === 'alta'
                  ? 'Gravedad alta'
                  : e.relevancia === 'media'
                  ? 'Media'
                  : 'Baja'}
              </span>
              <span className="text-[10.5px] text-slate-400">{e.detalle_unidades}</span>
            </div>
          )}
 
          <div className="dato text-[10px] text-slate-400 space-y-0.5 border-t border-white/10 pt-2">
            <div>{fechaHora(e.hora)}</div>
            <div>PARTE {e.id}</div>
            <div className="text-slate-500">{e.fuentes?.join(' · ')}</div>
          </div>
 
          <button
            onClick={() => onAbrirChat?.(e)}
            className="mt-2.5 w-full flex items-center justify-center gap-1.5
                       bg-white/[0.07] hover:bg-white/[0.12] border border-white/10
                       rounded-lg py-2 text-[12px] text-slate-200 transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 className="w-[14px] h-[14px]">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            </svg>
            Reportar lo que veo
          </button>
        </div>
      </Popup>
    </Marker>
  ));
}
 
export default function Mapa({
  eventos,
  mostrarCerrados = true,
  seccion,
  seleccionado,
  onLimpiar,
  nuevos,
  onAbrirChat,
  tema = 'oscuro',
}) {
  const [zoom, setZoom] = useState(11);
  const [miPos, setMiPos] = useState(null);
 
  function pedirUbicacion() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setMiPos([p.coords.latitude, p.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }
 
  const visibles = eventos.filter(
    (e) => e.coordenadas_validas && (mostrarCerrados || e.estado === 'atendiendo')
  );
 
  return (
    <MapContainer center={CENTRO} zoom={11} className="h-full w-full" zoomControl={false}>
      {/* La `key` fuerza a Leaflet a recrear la capa al cambiar de tema:
          sin ella reutiliza los tiles cacheados y el mapa no cambia. */}
      <TileLayer
        key={tema}
        url={(TEMAS[tema] ?? TEMAS.oscuro).url}
        attribution={(TEMAS[tema] ?? TEMAS.oscuro).atribucion}
        maxZoom={20}
      />
 
      <VigilarZoom onCambio={setZoom} />
      <AjustarTamano seccion={seccion} />
      <BotonUbicacion posicion={miPos} onPedir={pedirUbicacion} />
 
      {miPos && (
        <Marker
          position={miPos}
          icon={L.divIcon({
            className: '',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
            html: '<div class="yo"></div>',
          })}
        />
      )}
 
      <Marcadores
        eventos={visibles}
        conEtiqueta={zoom >= ZOOM_ETIQUETAS}
        seleccionado={seleccionado}
        onLimpiar={onLimpiar}
        nuevos={nuevos}
        onAbrirChat={onAbrirChat}
      />
    </MapContainer>
  );
}