import { Button, Icon } from '../../components';
import { usePush } from '../../lib/push';

const TEXT = {
  'ios-install': 'En iPhone, primero agregue la app a la pantalla de inicio: toque Compartir y luego "Agregar a inicio". Ábrala desde ese ícono y active aquí las notificaciones.',
  unsupported: 'Este navegador no permite notificaciones. En Android use Chrome; en iPhone, agregue la app a la pantalla de inicio.',
  denied: 'Las notificaciones están bloqueadas para esta app. Actívelas en los ajustes del navegador o del teléfono.',
  'not-ready': 'El colegio todavía está preparando las notificaciones. Intente de nuevo en unos minutos.',
};

/**
 * Turns the school's notifications on or off for this phone. `compact` is the home
 * screen banner: shown only while they're off.
 */
export function PushCard({ compact }: { compact?: boolean }) {
  const { state, error, enable, disable } = usePush();
  if (state === 'loading' || (compact && state !== 'off')) return null;

  return (
    <section className="card card--mobile gap-8" style={compact ? { borderColor: 'var(--blue)', background: 'var(--blue-bg)' } : undefined}>
      <div className="row gap-10">
        <Icon name="bell" size={22} style={{ color: 'var(--blue)', flexShrink: 0 }} />
        <span className="stack grow">
          <span className="title-card">Notificaciones</span>
          <span className="text-sm muted">
            {state === 'on' ? 'Activadas en este teléfono.' : 'Reciba al instante ausencias, tardías, salidas y avisos.'}
          </span>
        </span>
      </div>
      {state in TEXT && <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.45 }}>{TEXT[state as keyof typeof TEXT]}</p>}
      {error && (
        <span className="text-sm ink-orange" role="alert">
          No se pudo activar: {error}
        </span>
      )}
      {state === 'off' || state === 'not-ready' ? (
        <Button variant="primary" size="lg" onClick={enable}>
          Activar notificaciones
        </Button>
      ) : (
        state === 'on' && (
          <Button size="lg" onClick={disable}>
            Desactivar en este teléfono
          </Button>
        )
      )}
    </section>
  );
}
