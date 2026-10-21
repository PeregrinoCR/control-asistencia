import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { supabase } from '../../lib/supabase';
import { ExamCareLive } from './ExamCareLive';

/** Dirección · Cuido de exámenes. Needs the server: it works from the real timetable and staff. */
export function ExamCare() {
  if (supabase) return <ExamCareLive />;
  return (
    <AdminLayout>
      <PageHeader kicker="Comité de evaluación" title="Cuido de exámenes" />
      <p className="card text-sm muted">Esta pantalla funciona con los datos reales del colegio (horarios y personal).</p>
    </AdminLayout>
  );
}
