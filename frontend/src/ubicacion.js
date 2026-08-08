import { useCallback, useEffect, useRef, useState } from 'react';

const CLAVE_CERCANIA = 'radar.avisoCercania';

/** Radio que cuenta como "cerca de ti", en metros. */
export const RADIO_CERCANIA = 2000;

/** Entre un aviso de proximidad y el siguiente, en minutos. */
export const ESPERA_ENTRE_AVISOS = 5;

/**
 * Distancia en metros entre dos puntos (haversine).
 * A escala de una ciudad la curvatura importa poco, pero el cálculo es barato
 * y evita el error de tratar grados como si midieran lo mismo en lat y lon.
 */
export function distancia(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 840 -> "840 m" · 2400 -> "2.4 km" */
export function formatearDistancia(metros) {
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toFixed(1)} km`;
}

/** Coordenadas de un evento. El scraper usa `lon`; algunos payloads, `lng`. */
export function coordsDe(evento) {
  const lat = evento?.lat;
  const lon = evento?.lon ?? evento?.lng;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (lat === 0 && lon === 0) return null;
  return [lat, lon];
}

export function leerAvisoCercania() {
  try {
    return localStorage.getItem(CLAVE_CERCANIA) === 'true';
  } catch {
    return false;
  }
}

export function guardarAvisoCercania(v) {
  try {
    localStorage.setItem(CLAVE_CERCANIA, v ? 'true' : 'false');
  } catch {}
}

/**
 * Seguimiento de la posición del dispositivo.
 *
 * Usa `watchPosition` y no una lectura única: si el usuario se mueve, un radio
 * de proximidad calculado sobre una posición vieja miente. La posición no sale
 * nunca del navegador — todo el cálculo de cercanía es local.
 */
export function useUbicacion() {
  const [pos, setPos] = useState(null);
  const [precision, setPrecision] = useState(null);
  const [error, setError] = useState(null);
  const vigilanciaRef = useRef(null);

  const detener = useCallback(() => {
    if (vigilanciaRef.current != null) {
      navigator.geolocation.clearWatch(vigilanciaRef.current);
      vigilanciaRef.current = null;
    }
    setPos(null);
    setPrecision(null);
  }, []);

  const iniciar = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Este dispositivo no comparte ubicación.');
      return;
    }
    if (vigilanciaRef.current != null) return;

    setError(null);
    vigilanciaRef.current = navigator.geolocation.watchPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude]);
        setPrecision(p.coords.accuracy ?? null);
      },
      (e) => {
        vigilanciaRef.current = null;
        setError(
          e.code === 1
            ? 'Permiso de ubicación denegado.'
            : 'No se pudo obtener tu ubicación.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  }, []);

  const alternar = useCallback(() => {
    if (vigilanciaRef.current != null) detener();
    else iniciar();
  }, [iniciar, detener]);

  useEffect(() => () => detener(), [detener]);

  return { pos, precision, error, activo: pos != null, iniciar, detener, alternar };
}