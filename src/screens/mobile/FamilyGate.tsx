import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Segmented } from '../../components';
import { FamilyTabBar, MobileScreen } from '../../layouts/MobileScreen';
import { signOut, useAuth } from '../../lib/auth';
import { useFamily, type Kid, type Me } from '../../lib/family';
import { routes } from '../../routes';

export interface FamilyCtx {
  me: Me;
  kids: Kid[];
  kid: Kid;
  setKidId: (id: string) => void;
  schoolId: string;
}

function Message({ children, tabs }: { children: ReactNode; tabs?: boolean }) {
  return (
    <MobileScreen>
      <div className="screen-body" style={{ justifyContent: 'center', textAlign: 'center', gap: 16 }}>
        {children}
      </div>
      {tabs && <FamilyTabBar />}
    </MobileScreen>
  );
}

/**
 * Wraps every family screen backed by the server: asks to sign in, waits for the
 * family's data and explains when the account isn't linked to any student yet.
 */
export function FamilyGate({ children }: { children: (f: FamilyCtx) => ReactNode }) {
  const { ready, session, school } = useAuth();
  const location = useLocation();
  const { me, kids, kid, setKidId, error } = useFamily();

  if (ready && !session) return <Navigate to={routes.login} replace state={{ from: location.pathname }} />;
  if (error) return <Message>{<p className="text-sm ink-orange">No se pudo cargar: {error}</p>}</Message>;
  if (!ready || !kids) return <Message>{<p className="text-sm muted">Cargando…</p>}</Message>;
  if (!me || !kid || !school)
    return (
      <Message>
        <p style={{ fontSize: 16, lineHeight: 1.5 }}>
          Su cuenta ({session?.user.email}) todavía no está unida a ningún estudiante. Pida al colegio que registre su correo
          como encargado, o si es estudiante mayor de edad, su teléfono.
        </p>
        <button type="button" className="link-button" onClick={() => signOut()}>
          Salir
        </button>
      </Message>
    );
  return <>{children({ me, kids, kid, setKidId, schoolId: school.id })}</>;
}

/** Switches between a family's students; hidden when there is only one. */
export function KidPicker({ f }: { f: FamilyCtx }) {
  if (f.kids.length < 2) return null;
  return (
    <Segmented
      label="Estudiante"
      fill
      value={f.kid.id}
      onChange={f.setKidId}
      options={f.kids.map((k) => ({ value: k.id, label: `${k.short} · ${k.section}` }))}
    />
  );
}
