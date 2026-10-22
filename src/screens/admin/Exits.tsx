import { Navigate } from 'react-router-dom';
import { routes } from '../../routes';

/** Salidas tempranas now live inside Giras y salidas; this keeps old links and bookmarks working. */
export function Exits() {
  return <Navigate to={`${routes.admin.trips}?ver=salidas`} replace />;
}
