import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_JUSTIF, cargarAusencias, excepcionJustificacion, justifConfigOf, recordarDocente, type Ausencia, type JustifConfig } from '../../lib/justificaciones';
import { supabase } from '../../lib/supabase';
import { JustificationsView } from './Justifications';

/** Dirección · Justificaciones, with the real absences and their teachers. */
export function JustificationsLive() {
  const [items, setItems] = useState<Ausencia[] | null>(null);
  const [rules, setRules] = useState<JustifConfig>(DEFAULT_JUSTIF);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase!.from('colegios').select('config').maybeSingle();
    const cfg = justifConfigOf(data?.config);
    setRules(cfg);
    const r = await cargarAusencias(cfg);
    if (typeof r === 'string') return setError(r);
    setItems(r);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <JustificationsView
      items={items}
      rules={rules}
      error={error}
      onRemind={recordarDocente}
      onReopen={async (a, motivo) => {
        const msg = await excepcionJustificacion(a, true, motivo);
        if (!msg) await load();
        return msg;
      }}
    />
  );
}
