import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { routes } from '../routes';
import { supabase } from './supabase';

interface School {
  id: string;
  nombre: string;
  /** Public link to the school's logo, set in Configuración. */
  logo: string | null;
}

interface AuthState {
  /** False until the saved session has been read. */
  ready: boolean;
  session: Session | null;
  /** School of the signed-in staff member; null when the account isn't linked yet. */
  school: School | null;
  /** Roles of the signed-in staff member ('dir', 'doc', 'gua'…); empty for families. */
  roles: string[];
  /** A guardian or an adult student with their own account. */
  family: boolean;
}

const AuthContext = createContext<AuthState>({ ready: true, session: null, school: null, roles: [], family: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: !supabase, session: null, school: null, roles: [], family: false });

  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    const load = async (session: Session | null) => {
      if (!session) return setState({ ready: true, session, school: null, roles: [], family: false });
      const uid = session.user.id;
      const [school, me, guardian, adult] = await Promise.all([
        db.from('colegios').select('id, nombre, logo:config->>logo').maybeSingle(),
        db.from('personal').select('roles').eq('usuario_id', uid).maybeSingle(),
        db.from('encargados').select('id').eq('usuario_id', uid).maybeSingle(),
        db.from('estudiantes').select('id').eq('usuario_id', uid).maybeSingle(),
      ]);
      setState({ ready: true, session, school: school.data, roles: me.data?.roles ?? [], family: !!(guardian.data || adult.data) });
    };
    db.auth.getSession().then(({ data }) => load(data.session));
    const { data } = db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') load(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Where a person lands after signing in: families on their app, teachers on the roll call, the guard at the gate. */
export function homeFor(roles: string[], family = false) {
  if (roles.length === 0 && family) return routes.family.home;
  const panel = roles.some((r) => ['dir', 'ori', 'adm'].includes(r));
  // Teachers and support staff land on the roll call, which also lists their exam cares.
  if (!panel && roles.some((r) => r === 'doc' || r === 'gui' || r === 'aux')) return routes.teacher.rollCall;
  if (!panel && roles.includes('gua')) return routes.guard.gate;
  return routes.admin.today;
}

/** The first part of a route, such as '/familia' or '/porton'. A saved route is only reused within the same area. */
export const areaOf = (path: string) => '/' + (path.split('/')[1] ?? '');

/** Whether the person can use the administration panel (guide teachers see their own section). */
export const hasPanel = (roles: string[]) => roles.some((r) => ['dir', 'ori', 'adm', 'gui'].includes(r));

export const signOut = () => supabase?.auth.signOut();
