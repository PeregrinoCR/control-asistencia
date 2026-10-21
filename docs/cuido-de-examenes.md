# Próximo trabajo: cuido de exámenes (diseño acordado, sin construir)

El Comité de Evaluación quiere que la app proponga quién cuida cada examen; el comité revisa,
ajusta, publica (aviso a docentes) e imprime el rol para estudiantes.

## Reglas acordadas con el usuario
1. Punto de partida: el **horario normal de ese día** (tabla `horario`). El comité marca quién no está
   disponible esa noche y ajusta.
2. Orden para elegir cuidador de un aula: (a) el docente que tiene lección con esa sección a esa hora;
   (b) si no puede o está ausente (`ausencias_docentes`), un docente libre a esa hora con menos cuidos;
   (c) personal de apoyo: auxiliares, orientación, administración (con menos cuidos).
3. **Una persona cuida todo el examen** (exámenes desde las 8:00 p. m., varias lecciones). Se cambia de
   cuidador solo si: A) se le termina su horario de trabajo; B) debe dar lección a un grupo que no está
   en examen.
4. **Un cuidador por aula**, sin importar cuántos estudiantes. Varias secciones pueden ir a una misma aula.
5. El **docente de la materia** cuida el **aula de adecuación**. Aulas de adecuación por nivel (una para
   sétimo, otra para octavo…); el comité puede juntar varios niveles en una aula.
6. Lo que no se pueda cubrir queda "Sin cuidador". Todo sale en **borrador** → ajustes → Publicar → Imprimir.
7. **Informe de cuidos** por persona (cuidos y lecciones de cuido en el periodo) para equilibrar cargas;
   Excel y PDF.

## Datos nuevos a agregar
- Estudiantes: marca "con adecuación" (ficha en Estudiantes).
- Lista de aulas del colegio.
- Horario de trabajo del personal que no da lecciones (pendiente confirmar: ¿se ingresa en la ficha de
  Usuarios y permisos, ej. "6:00–9:50 p. m., L–V"?). Docentes: se deduce de su horario.
- Calendario de pruebas (hoy en `colegios.config.pruebas`): agregar duración (lecciones), aula y
  secciones que se juntan.
- Tabla `cuidos` (migración 0005): examen, aula, lección desde/hasta, persona, tipo (aula/adecuación),
  estado borrador/publicado.

## Pantalla
Panel › "Cuido de exámenes": por noche, lista de aulas con su cuidador propuesto, cambiar/intercambiar,
"Sin cuidador" resaltado, total de cuidos por persona, botones Publicar (notificación) e Imprimir.
Estimado: 1–2 sesiones + correr un SQL pequeño en Supabase.
