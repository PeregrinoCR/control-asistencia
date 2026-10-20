import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface School {
  id: string;
  nombre: string;
}

interface AuthState {
  /** False until the saved session has been read. */
  ready: boolean;
  session: Session | null;
  /** School of the signed-in staff member; null when the account isn't linked yet. */
  school: School | null;
}

const AuthContext = createContext<AuthState>({ ready: true, session: null, school: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: !supabase, session: null, school: null });

  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    const load = async (session: Session | null) => {
      const { data } = session ? await db.from('colegios').select('id, nombre').maybeSingle() : { data: null };
      setState({ ready: true, session, school: data });
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

export const signOut = () => supabase?.auth.signOut();
