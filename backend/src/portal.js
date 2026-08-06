const API_BASE = 'https://api.useportal.co/v1';

class PortalPublisher {
  constructor({ secretKey, canal }) {
    if (!secretKey) throw new Error('Falta PORTAL_SECRET en .env');
    this.secretKey = secretKey;
    this.canal = canal;
  }

  /**
   * Publica un evento al canal. Retorna el id del mensaje o null si falló.
   */
  async publicar(contenido, canal = this.canal) {
    const url = `${API_BASE}/channels/${canal}/messages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderId: 'radar-backend',
          content: contenido,
        }),
      });

      if (!res.ok) {
        const texto = await res.text();
        console.error(`  ✗ Portal ${res.status}: ${texto.slice(0, 200)}`);
        return null;
      }

      const data = await res.json();
      return data.id ?? true;
    } catch (err) {
      console.error(`  ✗ Error de red al publicar: ${err.message}`);
      return null;
    }
  }

  /**
   * Publica varios eventos en secuencia, con pausa mínima entre cada uno.
   */
  async publicarLote(eventos, canal = this.canal) {
    let ok = 0;
    for (const evento of eventos) {
      const r = await this.publicar(evento, canal);
      if (r) ok++;
      await new Promise((res) => setTimeout(res, 120));
    }
    return ok;
  }
}

/**
 * Construye el nombre de canal a partir del distrito.
 * 'LA VICTORIA' -> 'lima:la-victoria'
 * Preparado para agregar distritos sin refactorizar.
 */
function canalDeDistrito(distrito, ciudad = 'lima') {
  const slug = distrito
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
  return `${ciudad}:${slug}`;
}

module.exports = { PortalPublisher, canalDeDistrito };