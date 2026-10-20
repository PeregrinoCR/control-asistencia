import { useState } from 'react';
import { Button, QrCode, Segmented, initials } from '../../components';
import { FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { CARDS, cardPayload } from '../../data/gate';
import { SCHOOL_NAME } from '../../data/school';
import { routes } from '../../routes';
import { supabase } from '../../lib/supabase';
import { StudentCardLive } from './StudentCardLive';

const MINE = [CARDS[0], CARDS[1]];

/** Familia · Carné digital: the QR the guard scans at the gate. */
export function StudentCardScreen() {
  return supabase ? <StudentCardLive /> : <StudentCardScreenSample />;
}

/** The sample screen, shown while no server is configured. */
function StudentCardScreenSample() {
  const [code, setCode] = useState(MINE[0].code);
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const card = MINE.find((c) => c.code === code)!;
  const lost = reported[card.code];

  return (
    <MobileScreen>
      <ScreenHeader title="Carné estudiantil" subtitle="Se muestra en el portón al entrar y salir" backTo={routes.family.settings} backLabel="Volver a ajustes" />
      <div className="screen-body gap-16">
        <Segmented
          label="Estudiante"
          fill
          value={code}
          onChange={setCode}
          options={MINE.map((c) => ({ value: c.code, label: `${c.name.split(' ')[0]} · ${c.section}` }))}
        />

        <section className="id-card" aria-label={`Carné de ${card.name}`}>
          <span className="text-xs" style={{ fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--night-ink-3)' }}>
            {SCHOOL_NAME} · Curso 2026
          </span>
          <span className="id-card__photo" aria-hidden="true">
            {initials(card.name)}
          </span>
          <span className="stack gap-2">
            <span className="display" style={{ fontSize: 22 }}>
              {card.name}
            </span>
            <span style={{ fontSize: 14, color: 'var(--night-ink-2)' }}>
              Sección {card.section} · {card.age >= 18 ? 'mayor de edad' : 'menor de edad'}
            </span>
          </span>
          {lost ? (
            <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--night-ink)', padding: '24px 8px' }}>
              Este carné está desactivado. El colegio preparará uno nuevo con otro código.
            </p>
          ) : (
            <QrCode value={cardPayload(card)} size={210} label={`Código QR del carné de ${card.name}`} />
          )}
          <span className="tabular" style={{ fontSize: 13, letterSpacing: 1, color: 'var(--night-ink-3)' }}>
            {lost ? 'Código anterior desactivado' : card.code}
          </span>
        </section>

        <p className="text-sm muted" style={{ textAlign: 'center' }}>
          Sube el brillo de la pantalla para que el guarda lo lea más rápido. Sirve también el carné impreso.
        </p>

        <div className="card card--mobile gap-10">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>¿Se perdió el carné impreso?</h2>
          <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ink-2)' }}>
            Al reportarlo, el código deja de funcionar en el portón para que nadie más lo use, y el colegio prepara uno nuevo.
          </p>
          <Button
            variant={lost ? 'secondary' : 'danger-outline'}
            size="lg"
            onClick={() => setReported({ ...reported, [card.code]: !lost })}
          >
            {lost ? 'Lo encontré: reactivar' : 'Reportar como perdido'}
          </Button>
        </div>
      </div>
      <FamilyTabBar />
    </MobileScreen>
  );
}
