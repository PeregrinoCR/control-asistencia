import { Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { routes } from '../routes';

/** The address root: each person goes to their own screen (no session with a server: the login). */
export function Inicio() {
  const { ready, session, roles, family } = useAuth();
  if (!ready) return null;
  if (supabase && !session) return <Navigate to={routes.login} replace />;
  return <Navigate to={homeFor(roles, family)} replace />;
}
