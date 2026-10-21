/**
 * Orden de las secciones para mostrarlas: por nivel y luego por grupo, como 7-1, 7-2, 8-1… 11-2.
 * Un nombre que no sigue «nivel-grupo» se ordena como texto, después de los que sí lo siguen.
 */
export function ordenSecciones(a: string, b: string) {
  const pa = a.match(/^(\d+)-(.+)$/);
  const pb = b.match(/^(\d+)-(.+)$/);
  if (pa && pb) return Number(pa[1]) - Number(pb[1]) || pa[2].localeCompare(pb[2], 'es', { numeric: true });
  if (pa) return -1;
  if (pb) return 1;
  return a.localeCompare(b, 'es', { numeric: true });
}

/** Copia de la lista de secciones en orden ascendente. */
export function ordenarSecciones<T extends { nombre: string }>(rows: T[] | null | undefined): T[] {
  return [...(rows ?? [])].sort((x, y) => ordenSecciones(x.nombre, y.nombre));
}
