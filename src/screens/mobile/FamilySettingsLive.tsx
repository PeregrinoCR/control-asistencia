import { Link } from 'react-router-dom';
import { Button, Icon } from '../../components';
import { FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { signOut, useAuth } from '../../lib/auth';
import { routes } from '../../routes';
import { FamilyGate } from './FamilyGate';

/** Familia · Ajustes: carné, cuenta y estudiantes vinculados. */
export function FamilySettingsLive() {
  const { session, school } = useAuth();
  return (
    <FamilyGate>
      {(f) => (
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

            <section className="card card--mobile gap-8">
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Mi cuenta</h2>
              <div className="stack gap-2" style={{ fontSize: 14 }}>
                <span className="strong">{f.me.name}</span>
                <span className="muted">{session?.user.email}</span>
                <span className="muted">{f.me.self ? 'Estudiante mayor de edad' : 'Encargado legal'} · {school?.nombre}</span>
              </div>
              <span className="text-xs muted">Para corregir estos datos, comuníquese con la oficina del colegio.</span>
            </section>

            {!f.me.self && (
              <section className="card card--mobile gap-8">
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Estudiantes a cargo</h2>
                {f.kids.map((k) => (
                  <div key={k.id} className="row between" style={{ fontSize: 14 }}>
                    <span className="strong">{k.name}</span>
                    <span className="muted">Sección {k.section}</span>
                  </div>
                ))}
              </section>
            )}

            <Button size="lg" onClick={() => signOut()}>
              Cerrar sesión
            </Button>
          </div>
          <FamilyTabBar />
        </MobileScreen>
      )}
    </FamilyGate>
  );
}
