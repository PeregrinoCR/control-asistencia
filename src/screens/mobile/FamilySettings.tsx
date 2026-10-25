import { Link } from 'react-router-dom';
import { Icon } from '../../components';
import { FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { routes } from '../../routes';
import { supabase } from '../../lib/supabase';
import { FamilySettingsLive } from './FamilySettingsLive';

/** Familia · Ajustes. Only the student card is designed so far. */
export function FamilySettings() {
  return supabase ? <FamilySettingsLive /> : <FamilySettingsSample />;
}

/** The sample screen, shown while no server is configured. */
function FamilySettingsSample() {
  return (
    <MobileScreen>
      <ScreenHeader title="Ajustes" />
      <div className="screen-body gap-12">
        <Link to={routes.family.card} className="perm-link" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="perm-link__icon">
            <Icon name="qr" />
          </span>
          <span className="stack grow">
            <span className="title-item">Carné estudiantil</span>
            <span className="text-sm muted">Código QR para el portón · reportar pérdida</span>
          </span>
          <Icon name="chevronLeft" size={18} style={{ transform: 'rotate(180deg)', color: 'var(--muted)' }} />
        </Link>
        <div className="card card--mobile muted" style={{ fontSize: 15 }}>
          [AJUSTES DE LA CUENTA]
        </div>
      </div>
      <FamilyTabBar />
    </MobileScreen>
  );
}
