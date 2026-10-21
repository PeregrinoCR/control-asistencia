import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { supabase } from '../../lib/supabase';
import { RoomsLive } from './RoomsLive';

/** Académico · Aulas y grupos. Needs the server: the sections and the rooms are the school's own data. */
export function Rooms() {
  if (supabase) return <RoomsLive />;
  return (
    <AdminLayout>
      <PageHeader kicker="Académico" title="Aulas y grupos" />
      <p className="card text-sm muted">Esta pantalla funciona con los datos reales del colegio (secciones y aulas).</p>
    </AdminLayout>
  );
}
