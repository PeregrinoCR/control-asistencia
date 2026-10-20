import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, Icon, InputField, Segmented } from '../components';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { routes } from '../routes';

type Mode = 'in' | 'up' | 'reset';

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'El correo o la contraseña no coinciden.',
  'Email not confirmed': 'Falta confirmar el correo: abra el enlace que le llegó al crear la cuenta.',
  'User already registered': 'Ya existe una cuenta con ese correo. Use "Entrar".',
};

/** Inicio de sesión del personal del colegio (correo y contraseña). */
export function Login() {
  const { ready, session } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from ?? routes.admin.today;
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!supabase) return <Navigate to={routes.admin.today} replace />;
  if (ready && session) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setMessage({ ok: false, text: 'Escriba su correo.' });
    if (mode !== 'reset' && password.length < 8) return setMessage({ ok: false, text: 'La contraseña debe tener al menos 8 caracteres.' });
    setBusy(true);
    setMessage(null);
    const auth = supabase!.auth;
    const redirectTo = window.location.origin;
    const { error } =
      mode === 'in'
        ? await auth.signInWithPassword({ email, password })
        : mode === 'up'
          ? await auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
          : await auth.resetPasswordForEmail(email, { redirectTo });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: ERRORS[error.message] ?? error.message });
    if (mode === 'up') setMessage({ ok: true, text: 'Le enviamos un correo para confirmar la cuenta. Ábralo y luego entre aquí.' });
    if (mode === 'reset') setMessage({ ok: true, text: 'Si el correo está registrado, le llegará un enlace para crear una contraseña nueva.' });
  };

  return (
    <div className="login">
      <form className="card login__card stack gap-16" onSubmit={submit}>
        <div className="row gap-10">
          <div className="admin__logo">
            <Icon name="checkSquare" strokeWidth={2.2} />
          </div>
          <h1 className="title-section">Asistencia</h1>
        </div>
        <Segmented
          label="Opción"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setMessage(null);
          }}
          options={[
            { value: 'in', label: 'Entrar' },
            { value: 'up', label: 'Crear cuenta' },
          ]}
        />
        {mode === 'up' && (
          <span className="text-sm muted">Use el mismo correo que el colegio registró para usted.</span>
        )}
        <InputField id="l-correo" label="Correo" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== 'reset' && (
          <InputField
            id="l-clave"
            label="Contraseña"
            type="password"
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {message && (
          <span role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-sm ink-green' : 'text-sm ink-orange'}>
            {message.text}
          </span>
        )}
        <Button type="submit" variant="primary" block disabled={busy}>
          {busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : mode === 'up' ? 'Crear cuenta' : 'Enviar enlace'}
        </Button>
        <button type="button" className="link-button text-sm" onClick={() => setMode(mode === 'reset' ? 'in' : 'reset')}>
          {mode === 'reset' ? 'Volver' : 'Olvidé mi contraseña'}
        </button>
      </form>
    </div>
  );
}
