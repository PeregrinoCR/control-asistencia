import { supabase } from './supabase';

/**
 * Herramientas de desarrollo (Configuración › Desarrollo): borrar los datos del colegio y cargar datos de ejemplo.
 * Se quitan antes de la versión final. Los nombres son inventados.
 */

const SECCIONES = ['7-1', '7-2', '8-1', '9-1', '10-1', '10-2', '11-1', '11-2'];
const MATERIAS = ['Matemática', 'Español', 'Ciencias', 'Estudios Sociales', 'Inglés', 'Educación Física'];
const DOCENTES = ['Laura Mora', 'Carlos Rojas', 'Andrea Solís', 'Diego Vargas', 'Patricia Chaves', 'Luis Quesada'];
const DIAS = ['L', 'K', 'M', 'J', 'V'];
const LECCIONES = [1, 2, 3, 4, 5, 6];

/** Borra los datos del colegio (la función vive en la base de datos y exige permiso de configuración). */
export async function borrarDatos(): Promise<string> {
  const { error } = await supabase!.rpc('borrar_datos_colegio');
  return error?.message ?? '';
}

/** Carga secciones, docentes, materias y horarios de ejemplo. Los estudiantes se importan con Importar matrícula. */
export async function cargarEjemplos(colegioId: string): Promise<string> {
  const db = supabase!;
  const { count } = await db.from('secciones').select('id', { count: 'exact', head: true });
  if (count) return 'Ya hay secciones registradas. Borre los datos antes de cargar los ejemplos.';

  const secciones = await db.from('secciones').insert(SECCIONES.map((nombre) => ({ colegio_id: colegioId, nombre }))).select('id, nombre');
  if (secciones.error) return secciones.error.message;

  const materias = await db.from('materias').insert(MATERIAS.map((nombre) => ({ colegio_id: colegioId, nombre }))).select('id, nombre');
  if (materias.error) return materias.error.message;

  const docentes = await db
    .from('personal')
    .insert(DOCENTES.map((nombre) => ({ colegio_id: colegioId, nombre, roles: ['doc'] })))
    .select('id');
  if (docentes.error) return docentes.error.message;

  // Cada docente da una materia; el horario repite el mismo patrón en todas las secciones.
  const horario = secciones.data!.flatMap((s, si) =>
    DIAS.flatMap((dia) =>
      LECCIONES.map((leccion) => {
        const m = (si + leccion + DIAS.indexOf(dia)) % MATERIAS.length;
        return { seccion_id: s.id, dia, leccion, materia_id: materias.data![m].id, docente_id: docentes.data![m].id };
      }),
    ),
  );
  const h = await db.from('horario').insert(horario);
  if (h.error) return h.error.message;

  return '';
}
