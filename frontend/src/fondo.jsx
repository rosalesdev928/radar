import { useEffect, useRef } from 'react';

/**
 * Fondo de metal líquido — shader WebGL.
 *
 * POR QUÉ NO three.js
 * Crafter Station usa @react-three/fiber con postprocesado. Pero lo que R3F
 * acaba renderizando para un efecto de pantalla completa es exactamente esto:
 * un quad que cubre el viewport con un fragment shader encima. El grafo de
 * escena, las cámaras y las luces de three.js no participan. Escribirlo en
 * WebGL crudo da el mismo resultado en ~6 KB en vez de ~600 KB de bundle, en
 * una app que la gente puede abrir con datos móviles durante una emergencia.
 *
 * QUÉ HACE EL SHADER
 *  1. FBM (ruido fractal) con deformación de dominio en dos pasadas — las
 *     vetas curvas que leemos como líquido.
 *  2. Ruido de cresta: convierte las colinas suaves en filos.
 *  3. Iluminación por píxel. Tratamos el resultado como un campo de altura,
 *     derivamos la normal por diferencias finitas y calculamos un especular
 *     Blinn-Phong. Esto es lo que canvas no podía hacer y lo que separa
 *     "manchas grises" de "metal".
 *  4. Postprocesado en el mismo paso: aberración cromática en los bordes y
 *     viñeteado.
 *
 * Si el navegador no da contexto WebGL, el canvas queda transparente y se ve
 * el fondo sólido del contenedor. Sin errores, sin pantalla rota.
 */

const VERTEX = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;   // en píxeles
uniform float uForce;   // 0..1, se disipa tras mover el cursor

float hash(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);   // suavizado hermite

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  // La rotación entre octavas evita el patrón de rejilla que delata al ruido
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  // 4 octavas: con 5 el detalle se vuelve demasiado fino y el material
  // pierde las formas grandes que lo hacen legible como líquido.
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p);
    p = rot * p * 2.02;
    amp *= 0.5;
  }
  return v;
}

/** Campo de altura: es lo que luego iluminamos. */
float altura(vec2 uv, float t, vec2 empuje) {
  // Deformación de dominio: muestreamos el ruido en coordenadas que a su vez
  // vienen del ruido. De aquí salen las vetas.
  vec2 q = vec2(fbm(uv + vec2(0.0, t * 0.12)),
                fbm(uv + vec2(5.2, 1.3) - t * 0.09));

  vec2 r = vec2(fbm(uv + 3.4 * q + vec2(1.7, 9.2) + t * 0.15),
                fbm(uv + 3.4 * q + vec2(8.3, 2.8) - t * 0.11));

  float n = fbm(uv + 3.2 * r + empuje);

  // Cresta: 1 - |2n-1| deja filos brillantes donde el ruido cruza el medio
  float cresta = 1.0 - abs(n * 2.0 - 1.0);
  return pow(cresta, 2.2) * 0.85 + n * 0.15;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;   // centrado, sin deformar
  float t = uTime;

  // El cursor desplaza el campo. La caída se anula en el centro además de en
  // el borde: sin eso, el vector unitario gira 360 grados en un punto y
  // aparece una estrella radial que parece un defecto del render.
  vec2 haciaCursor = frag - uMouse;
  float dist = length(haciaCursor) / uRes.y;
  float radio = 0.45;
  vec2 empuje = vec2(0.0);
  if (dist < radio && uForce > 0.001) {
    float borde  = pow(1.0 - dist / radio, 2.0);
    float nucleo = smoothstep(0.0, radio * 0.35, dist);
    empuje = normalize(haciaCursor + 0.0001) * borde * nucleo * uForce * 0.55;
  }

  // Escala del material. Más bajo = formas más amplias.
  vec2 p = uv * 1.15;

  float h = altura(p, t, empuje);

  // Normal por diferencias finitas sobre el campo de altura
  float e = 0.0035;
  float hx = altura(p + vec2(e, 0.0), t, empuje);
  float hy = altura(p + vec2(0.0, e), t, empuje);
  vec3 normal = normalize(vec3((h - hx) / e, (h - hy) / e, 1.6));

  vec3 luz  = normalize(vec3(-0.45, 0.75, 0.55));
  vec3 vista = vec3(0.0, 0.0, 1.0);
  vec3 medio = normalize(luz + vista);

  float difusa   = max(dot(normal, luz), 0.0);
  float especular = pow(max(dot(normal, medio), 0.0), 42.0);
  // Fresnel: los bordes del material brillan más, como el metal real
  float fresnel  = pow(1.0 - max(dot(normal, vista), 0.0), 3.0);

  vec3 oscuro = vec3(0.020, 0.028, 0.045);
  vec3 medioT = vec3(0.115, 0.135, 0.180);
  vec3 claro  = vec3(0.640, 0.700, 0.820);

  vec3 color = mix(oscuro, medioT, h);
  color += claro * especular * 0.85;
  color += vec3(0.16, 0.20, 0.30) * fresnel * 0.5;
  color += medioT * difusa * 0.18;

  // Aberración cromática hacia los bordes: el postprocesado, sin segundo paso
  float rad = length(uv);
  color.r *= 1.0 + rad * 0.055;
  color.b *= 1.0 + rad * 0.10;

  // Viñeteado
  color *= 1.0 - rad * 0.38;

  // Grano tenue: rompe el bandeado de los degradados oscuros
  color += (hash(frag + t) - 0.5) * 0.016;

  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
`;

function compilar(gl, tipo, fuente) {
  const sh = gl.createShader(tipo);
  gl.shaderSource(sh, fuente);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('[fondo] shader:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function Fondo({ className = '' }) {
  const canvasRef = useRef(null);
  const punteroRef = useRef({ x: -9999, y: -9999, fuerza: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext('webgl', { antialias: false, alpha: false, depth: false }) ||
      canvas.getContext('experimental-webgl');

    // Sin WebGL no rompemos nada: se ve el fondo sólido del contenedor
    if (!gl) return;

    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const vs = compilar(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[fondo] link:', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // Un solo triángulo que cubre el viewport: más barato que dos y sin
    // costura diagonal en el centro
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');
    const uForce = gl.getUniformLocation(prog, 'uForce');

    let animacion = null;
    let perdido = false;

    function medir() {
      // Limitamos la densidad de píxeles: a 3x en un móvil el shader se
      // arrastra, y a esta escala la diferencia visual es nula.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, canvas.width, canvas.height);
    }

    function dibujar(ms) {
      if (perdido) return;
      animacion = requestAnimationFrame(dibujar);

      const p = punteroRef.current;
      gl.uniform1f(uTime, quieto ? 8.0 : ms * 0.001);
      gl.uniform2f(uMouse, p.x, p.y);
      gl.uniform1f(uForce, p.fuerza);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      p.fuerza *= 0.97; // el empuje se disipa solo

      if (quieto) {
        cancelAnimationFrame(animacion);
        animacion = null;
      }
    }

    function moverPuntero(e) {
      const rect = canvas.getBoundingClientRect();
      const f = e.touches?.[0] ?? e;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      punteroRef.current = {
        // gl_FragCoord tiene el origen abajo; el DOM, arriba
        x: (f.clientX - rect.left) * dpr,
        y: (rect.height - (f.clientY - rect.top)) * dpr,
        fuerza: Math.min(1, punteroRef.current.fuerza + 0.3),
      };
    }

    function alPerderContexto(e) {
      e.preventDefault();
      perdido = true;
      if (animacion) cancelAnimationFrame(animacion);
      animacion = null;
    }

    function alRecuperarContexto() {
      perdido = false;
      if (!animacion) animacion = requestAnimationFrame(dibujar);
    }

    function alCambiarVisibilidad() {
      if (document.hidden) {
        if (animacion) cancelAnimationFrame(animacion);
        animacion = null;
      } else if (!animacion && !perdido) {
        animacion = requestAnimationFrame(dibujar);
      }
    }

    function alRedimensionar() {
      medir();
      if (quieto) dibujar(8000);
    }

    medir();
    animacion = requestAnimationFrame(dibujar);

    window.addEventListener('resize', alRedimensionar);
    window.addEventListener('pointermove', moverPuntero, { passive: true });
    window.addEventListener('touchmove', moverPuntero, { passive: true });
    canvas.addEventListener('webglcontextlost', alPerderContexto);
    canvas.addEventListener('webglcontextrestored', alRecuperarContexto);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      if (animacion) cancelAnimationFrame(animacion);
      window.removeEventListener('resize', alRedimensionar);
      window.removeEventListener('pointermove', moverPuntero);
      window.removeEventListener('touchmove', moverPuntero);
      canvas.removeEventListener('webglcontextlost', alPerderContexto);
      canvas.removeEventListener('webglcontextrestored', alRecuperarContexto);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);

      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} className={`fondo-liquido ${className}`} aria-hidden="true" />;
}