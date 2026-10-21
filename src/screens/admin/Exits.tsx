import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { EarlyExitSample } from '../mobile/EarlyExit';
import { supabase } from '../../lib/supabase';
import { ExitsLive } from './ExitsLive';

/** Dirección · Salidas tempranas: las solicitudes de las familias, para aprobar o rechazar. Needs the server. */
export function Exits() {
  if (supabase) return <ExitsLive />;
  return (
    <AdminLayout>
      <PageHeader kicker="Familias piden, dirección decide" title="Salidas tempranas" />
      <p className="card text-sm muted">Esta pantalla funciona con las solicitudes reales de las familias.</p>
      <EarlyExitSample />
    </AdminLayout>
  );
}
