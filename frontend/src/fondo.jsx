import { useEffect, useRef } from 'react';

/**
 * Fondo animado de "metal líquido": manchas que se funden entre sí y huyen
 * del cursor.
 *
 * Sin dependencias. El efecto de fusión no se calcula por píxel (sería caro);
 * dibujamos degradados radiales en escala de grises y dejamos que un filtro
 * CSS de desenfoque + contraste los pegue. Es la misma idea del "gooey filter"
 * clásico, pero sobre canvas para poder animarlo barato.
 */

const CANTIDAD = 11;
const VISCOSIDAD = 0.94; // cuánto se frena una mancha por cuadro
const ALCANCE_CURSOR = 260; // px de influencia del puntero
const FUERZA_CURSOR = 0.55;

function crearManchas(ancho, alto) {
  return Array.from({ length: CANTIDAD }, (_, i) => {
    const grande = i % 3 === 0;
    return {
      x: Math.random() * ancho,
      y: Math.random() * alto,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: (grande ? 150 : 85) + Math.random() * 70,
      // Cada mancha late a su propio ritmo para que nunca se vea en bucle
      fase: Math.random() * Math.PI * 2,
      ritmo: 0.0004 + Math.random() * 0.0008,
    };
  });
}

export default function Fondo({ className = '' }) {
  const canvasRef = useRef(null);
  const punteroRef = useRef({ x: -9999, y: -9999, activo: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let ancho = 0;
    let alto = 0;
    let manchas = [];
    let animacion = null;

    function medir() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();

      ancho = rect.width;
      alto = rect.height;

      canvas.width = Math.floor(ancho * dpr);
      canvas.height = Math.floor(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!manchas.length) manchas = crearManchas(ancho, alto);
    }

    function dibujar(t) {
      ctx.fillStyle = '#080D16';
      ctx.fillRect(0, 0, ancho, alto);

      const p = punteroRef.current;

      for (const m of manchas) {
        if (!quieto) {
          // Deriva lenta, distinta para cada mancha
          m.vx += Math.cos(t * m.ritmo + m.fase) * 0.012;
          m.vy += Math.sin(t * m.ritmo * 1.3 + m.fase) * 0.012;

          if (p.activo) {
            const dx = m.x - p.x;
            const dy = m.y - p.y;
            const dist = Math.hypot(dx, dy) || 1;

            if (dist < ALCANCE_CURSOR) {
              // Se apartan del cursor, más fuerte cuanto más cerca
              const empuje = (1 - dist / ALCANCE_CURSOR) * FUERZA_CURSOR;
              m.vx += (dx / dist) * empuje;
              m.vy += (dy / dist) * empuje;
            }
          }

          m.vx *= VISCOSIDAD;
          m.vy *= VISCOSIDAD;
          m.x += m.vx;
          m.y += m.vy;

          // Rebote suave contra los bordes, con margen para que no se corten
          const margen = m.r * 0.4;
          if (m.x < -margen) m.vx += 0.25;
          if (m.x > ancho + margen) m.vx -= 0.25;
          if (m.y < -margen) m.vy += 0.25;
          if (m.y > alto + margen) m.vy -= 0.25;
        }

        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
        g.addColorStop(0, 'rgba(226,232,240,0.95)');
        g.addColorStop(0.55, 'rgba(148,163,184,0.35)');
        g.addColorStop(1, 'rgba(148,163,184,0)');

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animacion = requestAnimationFrame(dibujar);
    }

    function moverPuntero(e) {
      const rect = canvas.getBoundingClientRect();
      const fuente = e.touches?.[0] ?? e;
      punteroRef.current = {
        x: fuente.clientX - rect.left,
        y: fuente.clientY - rect.top,
        activo: true,
      };
    }

    function soltarPuntero() {
      punteroRef.current.activo = false;
    }

    /* Con la pestaña oculta no tiene sentido seguir pintando */
    function alCambiarVisibilidad() {
      if (document.hidden) {
        if (animacion) cancelAnimationFrame(animacion);
        animacion = null;
      } else if (!animacion) {
        animacion = requestAnimationFrame(dibujar);
      }
    }

    medir();
    animacion = requestAnimationFrame(dibujar);

    window.addEventListener('resize', medir);
    window.addEventListener('pointermove', moverPuntero, { passive: true });
    window.addEventListener('pointerleave', soltarPuntero);
    window.addEventListener('touchmove', moverPuntero, { passive: true });
    window.addEventListener('touchend', soltarPuntero);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      if (animacion) cancelAnimationFrame(animacion);
      window.removeEventListener('resize', medir);
      window.removeEventListener('pointermove', moverPuntero);
      window.removeEventListener('pointerleave', soltarPuntero);
      window.removeEventListener('touchmove', moverPuntero);
      window.removeEventListener('touchend', soltarPuntero);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, []);

  return <canvas ref={canvasRef} className={`fondo-liquido ${className}`} aria-hidden="true" />;
}