import { useEffect, useState } from 'react';
import { Button, QrCode, initials } from '../../components';
import { FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { CARD_PREFIX } from '../../data/gate';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';
import { FamilyGate, KidPicker, type FamilyCtx } from './FamilyGate';

/** Familia · Carné digital with the student's real, opaque code. */
export function StudentCardLive() {
  return <FamilyGate>{(f) => <Card f={f} />}</FamilyGate>;
}

function Card({ f }: { f: FamilyCtx }) {
  const { kid } = f;
  const { school } = useAuth();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setCode(undefined);
    setMsg('');
    supabase!
      .from('carnes')
      .select('codigo')
      .eq('estudiante_id', kid.id)
      .eq('revocado', false)
      .maybeSingle()
      .then(({ data }) => setCode(data?.codigo ?? null));
  }, [kid]);

  const replace = async () => {
    const { data, error } = await supabase!.rpc('reponer_carne', { estudiante: kid.id });
    setConfirm(false);
    if (error) return setMsg('No se pudo: ' + error.message);
    setCode(data as string);
    setMsg('Listo: el código anterior ya no funciona en el portón. Use este nuevo; pida al colegio el carné impreso.');
  };

  return (
    <MobileScreen>
      <ScreenHeader title="Carné estudiantil" subtitle="Se muestra en el portón al entrar y salir" backTo={routes.family.settings} backLabel="Volver a ajustes" />
      <div className="screen-body gap-16">
        <KidPicker f={f} />
        <section className="id-card" aria-label={`Carné de ${kid.name}`}>
          <span className="row gap-8 text-xs" style={{ fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--night-ink-3)' }}>
            {school?.logo && <img src={school.logo} alt="" style={{ height: 22, borderRadius: 4, background: '#fff' }} />}
            {school?.nombre} · Curso {new Date().getFullYear()}
          </span>
          <span className="id-card__photo" aria-hidden="true">
            {initials(kid.name)}
          </span>
          <span className="stack gap-2">
            <span className="display" style={{ fontSize: 22 }}>
              {kid.name}
            </span>
            <span style={{ fontSize: 14, color: 'var(--night-ink-2)' }}>
              Sección {kid.section} · {kid.adult ? 'mayor de edad' : 'menor de edad'}
            </span>
          </span>
          {code ? (
            <QrCode value={CARD_PREFIX + code} size={210} label={`Código QR del carné de ${kid.name}`} />
          ) : (
            <p style={{ fontSize: 15, color: 'var(--night-ink)', padding: '24px 8px' }}>{code === null ? 'Aún no tiene carné.' : 'Cargando…'}</p>
          )}
          <span className="tabular" style={{ fontSize: 13, letterSpacing: 1, color: 'var(--night-ink-3)' }}>
            {code}
          </span>
        </section>

        <p className="text-sm muted" style={{ textAlign: 'center' }}>
          Sube el brillo de la pantalla para que el guarda lo lea más rápido. Sirve también el carné impreso.
        </p>
        {msg && (
          <p role="status" className="text-sm strong ink-green" style={{ textAlign: 'center' }}>
            {msg}
          </p>
        )}

        <div className="card card--mobile gap-10">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>¿Se perdió el carné impreso?</h2>
          <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ink-2)' }}>
            Al reportarlo, el código actual deja de funcionar en el portón para que nadie más lo use, y se crea uno nuevo al
            instante.
          </p>
          {confirm ? (
            <div className="grid-2">
              <Button size="lg" onClick={() => setConfirm(false)}>
                Cancelar
              </Button>
              <Button variant="danger" size="lg" onClick={replace}>
                Sí, reportar
              </Button>
            </div>
          ) : (
            <Button variant="danger-outline" size="lg" disabled={!code} onClick={() => setConfirm(true)}>
              Reportar como perdido
            </Button>
          )}
        </div>
      </div>
      <FamilyTabBar />
    </MobileScreen>
  );
}
