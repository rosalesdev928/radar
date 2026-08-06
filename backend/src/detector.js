/**
 * Mantiene en memoria los eventos ya vistos (clave: N° de parte).
 * En cada ciclo determina qué es nuevo y qué cambió de estado.
 */
class DetectorDeCambios {
  constructor() {
    this.vistos = new Map(); // id -> { estado, hash }
    this.primeraCarga = true;
  }

  /**
   * @returns {{ nuevos: [], actualizados: [], esPrimeraCarga: boolean }}
   */
  procesar(eventos) {
    const nuevos = [];
    const actualizados = [];

    for (const evento of eventos) {
      const previo = this.vistos.get(evento.id);

      if (!previo) {
        nuevos.push(evento);
        this.vistos.set(evento.id, { estado: evento.estado });
        continue;
      }

      // Mismo parte, pero cambió de ATENDIENDO a CERRADO (o viceversa)
      if (previo.estado !== evento.estado) {
        actualizados.push({ ...evento, estadoAnterior: previo.estado });
        this.vistos.set(evento.id, { estado: evento.estado });
      }
    }

    const esPrimeraCarga = this.primeraCarga;
    this.primeraCarga = false;

    return { nuevos, actualizados, esPrimeraCarga };
  }

  get totalConocidos() {
    return this.vistos.size;
  }
}

module.exports = { DetectorDeCambios };