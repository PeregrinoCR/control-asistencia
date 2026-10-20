import { useCallback, useEffect, useState } from 'react';
import type { JustState, Justification } from '../../data/admin';
import { useAuth } from '../../lib/auth';
import { ageOn } from '../../lib/students';
import { supabase } from '../../lib/supabase';
import { JustificationsView } from './Justifications';

const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' });

const sentAt = (t: string) =>
  new Date(t).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Dirección · Justificaciones, with the requests families send from the app. */
export function JustificationsLive() {
  const { session } = useAuth();
  const [items, setItems] = useState<Justification[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const db = supabase!;
    const [js, gs] = await Promise.all([
      db
        .from('justificaciones')
        .select('id, tipo, desde, hasta, lecciones, motivo, comentario, documento, enviado, enviado_por, estado, estudiantes(nombre, nacimiento, usuario_id, secciones(nombre))')
        .order('enviado', { ascending: false }),
      db.from('encargados').select('usuario_id, nombre').not('usuario_id', 'is', null),
    ]);
    if (js.error) return setError(js.error.message);
    const guardian = new Map((gs.data ?? []).map((g) => [g.usuario_id, g.nombre]));
    setItems(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (js.data as any[]).map((r) => {
        const st = r.estudiantes ?? {};
        const minor = (ageOn(st.nacimiento) ?? 0) < 18;
        return {
          id: r.id,
          name: st.nombre ?? '—',
          section: st.secciones?.nombre ?? '—',
          minor,
          kind: r.tipo,
          date: r.desde === r.hasta ? shortDate(r.desde) : `${shortDate(r.desde)} al ${shortDate(r.hasta)}`,
          lessons: r.lecciones ?? '—',
          reason: r.motivo,
          by: r.enviado_por && r.enviado_por === st.usuario_id ? 'El estudiante (mayor de edad)' : (guardian.get(r.enviado_por) ?? 'Encargado'),
          sent: sentAt(r.enviado),
          comment: r.comentario ?? '',
          doc: r.documento ?? '',
          state: r.estado,
        };
      }),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: Justification['id'], estado: JustState) => {
    const db = supabase!;
    const { data: me } = await db.from('personal').select('id').eq('usuario_id', session!.user.id).maybeSingle();
    const { error } = await db
      .from('justificaciones')
      .update({ estado, revisado_por: estado === 'p' ? null : (me?.id ?? null) })
      .eq('id', id);
    return error?.message ?? '';
  };

  return (
    <JustificationsView
      items={items ?? []}
      onDecide={decide}
      status={error ? `No se pudieron cargar: ${error}` : !items ? 'Cargando…' : undefined}
    />
  );
}
