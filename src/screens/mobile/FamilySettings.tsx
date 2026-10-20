import { Link } from 'react-router-dom';
import { Icon } from '../../components';
import { FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { routes } from '../../routes';

/** Familia · Ajustes. Only the student card is designed so far. */
export function FamilySettings() {
  return (
    <MobileScreen>
      <ScreenHeader title="Ajustes" />
      <div className="screen-body gap-12">
        <Link to={routes.family.card} className="perm-link" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="perm-link__icon">
            <Icon name="qr" />
          </span>
          <span className="stack grow">
            <span style={{ fontSize: 15, fontWeight: 700 }}>Carné estudiantil</span>
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
