// Glifos por tipo de incidente. Trazo blanco sobre pin de color.
export const GLIFOS = {
  incendio: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  accidente_vehicular:
    '<path d="M19 17h2v-4a2 2 0 0 0-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3A2.5 2.5 0 0 0 12 7H5.5a1.5 1.5 0 0 0-1.4.9L2.6 11A3.7 3.7 0 0 0 2 13v4h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>',
  emergencia_medica: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  materiales_peligrosos:
    '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  rescate:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="m5.7 5.7 3.8 3.8"/><path d="m14.5 14.5 3.8 3.8"/><path d="m18.3 5.7-3.8 3.8"/><path d="m9.5 14.5-3.8 3.8"/>',
  transito: '<path d="M12 3 5 20h14L12 3z"/><path d="M9 13h6"/><path d="M8 17h8"/>',
  otro: '<circle cx="12" cy="12" r="7"/>',
};

export const COLORES = {
  incendio: '#FF3B30',
  accidente_vehicular: '#FF7A29',
  emergencia_medica: '#35A7FF',
  materiales_peligrosos: '#FFB020',
  rescate: '#A855F7',
  transito: '#22D3EE',
  otro: '#7C8AA0',
};

export const ETIQUETAS = {
  incendio: 'Incendio',
  accidente_vehicular: 'Accidente',
  emergencia_medica: 'Médica',
  materiales_peligrosos: 'Materiales peligrosos',
  rescate: 'Rescate',
  transito: 'Tránsito',
  otro: 'Otro',
};

export function svgDe(tipo) {
  const d = GLIFOS[tipo] ?? GLIFOS.otro;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}