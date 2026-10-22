import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ButtonLink, Icon, MiniStat, StatusBadge } from '../../components';
import { FamilyTabBar, MobileScreen } from '../../layouts/MobileScreen';
import { MARK_STATUS } from '../../data/school';
import { kidRecords, monthTotals, useKidToday, type Exit } from '../../lib/family';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';
import { FamilyGate, KidPicker, type FamilyCtx } from './FamilyGate';
import { PushCard } from './PushCard';

/** Familia · Inicio, with the student's real day. */
export function FamilyHomeLive() {
  return <FamilyGate>{(f) => <Home f={f} />}</FamilyGate>;
}

interface Trip {
  id: string;
  title: string;
  date: string;
  deadline: string | null;
  answer: 'ok' | 'no' | null;
}

interface Notice {
  id: string;
  type: string;
  title: string;
  body: string;
  sent: string;
}

const firstOfMonth = () => localDate().slice(0, 8) + '01';
const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' });

function Home({ f }: { f: FamilyCtx }) {
  const { kid } = f;
  const lessons = useKidToday(kid);
  const [month, setMonth] = useState<ReturnType<typeof monthTotals> | null>(null);
  const [exit, setExit] = useState<Exit | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const today = localDate();

  useEffect(() => {
    const db = supabase!;
    (async () => {
      const rec = await kidRecords(kid.id, firstOfMonth(), today);
      setMonth(monthTotals(rec.days));
      setExit(rec.exits.find((e) => e.date === today) ?? null);
      const [g, a, n] = await Promise.all([
        kid.sectionId
          ? db.from('giras').select('id, titulo, fecha, fecha_limite').contains('secciones', [kid.sectionId]).gte('fecha', today).order('fecha')
          : Promise.resolve({ data: [] }),
        db.from('gira_autorizaciones').select('gira_id, estado').eq('estudiante_id', kid.id),
        db.from('avisos').select('id, tipo, titulo, cuerpo, destino, secciones, enviado').order('enviado', { ascending: false }).limit(20),
      ]);
      const answers = new Map((a.data ?? []).map((x) => [x.gira_id, x.estado]));
      setTrips((g.data ?? []).map((t) => ({ id: t.id, title: t.titulo, date: t.fecha, deadline: t.fecha_limite, answer: answers.get(t.id) ?? null })));
      // Notices for everyone, for guardians or adults as fits this account, or for the student's section.
      const mine = (n.data ?? [])
        .filter((x) => x.destino === 'all' || x.destino === (f.me.self ? 'adu' : 'enc') || (x.destino === 'sec' && (x.secciones as string[]).includes(kid.sectionId ?? '')))
        .slice(0, 3);
      setNotices(mine.map((x) => ({ id: x.id, type: x.tipo, title: x.titulo, body: x.cuerpo, sent: x.enviado })));
      const uid = (await db.auth.getUser()).data.user?.id;
      if (uid && mine.length)
        await db.from('aviso_lecturas').upsert(
          mine.map((x) => ({ aviso_id: x.id, usuario_id: uid })),
          { onConflict: 'aviso_id,usuario_id', ignoreDuplicates: true },
        );
    })();
  }, [kid, today, f.me.self]);

  // The latest absence or late arrival today, if any.
  const flagged = [...(lessons ?? [])].reverse().find((l) => l.mark === 'A' || l.mark === 'T');
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Buenos días,' : hour < 18 ? 'Buenas tardes,' : 'Buenas noches,';

  // Permissions only jump to the top when there is something to sign.
  const pendingTrips = trips.some((t) => !t.answer);

  return (
    <MobileScreen>
      <div className="screen-body gap-16" style={{ padding: '24px 16px 16px' }}>
        <div className="stack" style={{ padding: '0 4px' }}>
          <span className="muted" style={{ fontSize: 14 }}>
            {hello}
          </span>
          {f.me.self ? (
            <h1 className="display" style={{ fontSize: 28, letterSpacing: -0.4 }}>
              {f.me.first}
            </h1>
          ) : (
            <>
              <span className="text-sm muted">Encargado/a de:</span>
              <h1 className="display" style={{ fontSize: 28, letterSpacing: -0.4 }}>
                {f.kid.name}
              </h1>
            </>
          )}
        </div>

        <KidPicker f={f} />
        <PushCard compact />

        {flagged ? (
          <section className="alert-card" data-tone={flagged.mark === 'A' ? 'orange' : 'amber'} aria-live="polite">
            <div className="row gap-10">
              <div className="alert-card__icon">
                <Icon name="alert" size={22} strokeWidth={2.2} />
              </div>
              <div className="stack">
                <span className="alert-card__when">Hoy · {flagged.start}</span>
                <span style={{ fontSize: 18, fontWeight: 700 }}>
                  {kid.short} {flagged.mark === 'A' ? 'fue marcado(a) ausente' : 'llegó tarde'}
                </span>
              </div>
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink-2)' }}>
              {flagged.subject}
              {flagged.teacher && `, con ${flagged.teacher}`}. {flagged.mark === 'A' ? 'Para justificarla, presente el comprobante a ese profesor en el colegio. Aquí puede avisar el motivo.' : ''}
            </p>
            {flagged.mark === 'A' && (
              <ButtonLink variant="danger" size="lg" to={routes.family.justify} state={{ date: today }}>
                Avisar el motivo
              </ButtonLink>
            )}
          </section>
        ) : (
          <section className="card card--mobile gap-4">
            <span style={{ fontSize: 17, fontWeight: 700 }}>Sin novedades hoy</span>
            <span className="text-sm muted">Le avisaremos aquí si {kid.short} falta o llega tarde.</span>
          </section>
        )}

        <section className="card card--mobile gap-10" style={{ order: pendingTrips ? 0 : 2 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Permisos y autorizaciones</h2>
          {trips.map((t) => (
            <Link key={t.id} to={routes.family.trip} state={{ id: t.id }} className="perm-link">
              <span className="perm-link__icon">
                <Icon name="bus" />
              </span>
              <span className="stack grow">
                <span style={{ fontSize: 15, fontWeight: 700 }}>{t.title}</span>
                <span className="text-sm muted">
                  {shortDate(t.date)}
                  {t.deadline && !t.answer && ` · firme antes del ${shortDate(t.deadline)}`}
                </span>
              </span>
              {t.answer === 'ok' ? <Badge tone="green">Autorizada</Badge> : t.answer === 'no' ? <Badge tone="neutral">No va</Badge> : <Badge tone="orange">Falta firma</Badge>}
            </Link>
          ))}
          {exit && exit.estado === 'aprobada' ? (
            <div className="perm-link" style={{ cursor: 'default' }}>
              <span className="perm-link__icon">
                <Icon name="logout" />
              </span>
              <span className="stack grow">
                <span style={{ fontSize: 15, fontWeight: 700 }}>Salida autorizada a las {exit.hour} p. m.</span>
                <span className="text-sm muted">{exit.left ? 'Ya salió del colegio.' : `Comprobante ${exit.receipt}`}</span>
              </span>
            </div>
          ) : exit && exit.estado === 'pendiente' ? (
            <div className="perm-link" style={{ cursor: 'default' }}>
              <span className="perm-link__icon">
                <Icon name="logout" />
              </span>
              <span className="stack grow">
                <span style={{ fontSize: 15, fontWeight: 700 }}>Solicitud enviada</span>
                <span className="text-sm muted">Dirección revisará la solicitud de salida a las {exit.hour} p. m.</span>
              </span>
            </div>
          ) : exit && exit.estado === 'rechazada' ? (
            <>
              <div className="perm-link" style={{ cursor: 'default' }}>
                <span className="perm-link__icon">
                  <Icon name="logout" />
                </span>
                <span className="stack grow">
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Salida no autorizada</span>
                  <span className="text-sm muted">Motivo: {exit.motivo_rechazo ?? 'sin detalle'}.</span>
                </span>
              </div>
              <ButtonLink variant="outline-blue" to={routes.family.earlyExit} size="lg">
                <Icon name="logout" size={18} />
                Pedir la salida de nuevo
              </ButtonLink>
            </>
          ) : (
            !kid.adult && (
              <ButtonLink variant="outline-blue" to={routes.family.earlyExit} size="lg">
                <Icon name="logout" size={18} />
                Autorizar salida temprana
              </ButtonLink>
            )
          )}
        </section>

        <section className="card card--mobile" style={{ order: 1 }}>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Hoy, lección por lección</h2>
            <Link to={routes.family.schedule} style={{ fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Ver horario
            </Link>
          </div>
          {!lessons ? (
            <span className="text-sm muted">Cargando…</span>
          ) : lessons.length === 0 ? (
            <span className="text-sm muted">Hoy no hay lecciones para la sección {kid.section}.</span>
          ) : (
            lessons.map((l) => (
              <div key={l.lesson} className="row gap-12" style={{ minHeight: 40 }}>
                <span className="text-sm muted tabular" style={{ width: 76 }}>
                  {l.start}
                </span>
                <span className="stack grow">
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{l.subject}</span>
                  {l.change?.kind === 'sub' ? (
                    <span className="text-xs muted">Sustituye: {l.change.substitute}</span>
                  ) : l.change?.kind === 'task' ? (
                    <span className="text-xs muted">Trabajo asignado en el aula</span>
                  ) : (
                    l.teacher && <span className="text-xs muted">{l.teacher}</span>
                  )}
                </span>
                {l.change?.kind === 'free' ? (
                  <Badge tone="amber" size="md">
                    Lección libre
                  </Badge>
                ) : (
                  <StatusBadge status={MARK_STATUS[l.mark]} size="md" />
                )}
              </div>
            ))
          )}
        </section>

        <section className="card card--mobile" style={{ order: 3 }}>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Este mes</h2>
            <Link to={routes.family.history} style={{ fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Ver historial
            </Link>
          </div>
          <div className="grid-3">
            <MiniStat label="Asistencia" value={month?.pct == null ? '—' : `${month.pct} %`} />
            <MiniStat label="Ausencias" value={month?.absences ?? 0} ink="orange" />
            <MiniStat label="Tardías" value={month?.lates ?? 0} ink="amber" />
          </div>
        </section>

        {notices.length > 0 && (
          <section className="card card--mobile gap-10" aria-labelledby="avisos-t" style={{ order: 4 }}>
            <h2 id="avisos-t" style={{ fontSize: 17, fontWeight: 700 }}>
              Avisos del colegio
            </h2>
            {notices.map((n) => (
              <div key={n.id} className="stack gap-2" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
                <span className="row between gap-8">
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{n.title}</span>
                  {(n.type === 'urg' || n.type === 'sus') && <Badge tone={n.type === 'urg' ? 'orange' : 'amber'}>{n.type === 'urg' ? 'Urgente' : 'Suspensión'}</Badge>}
                </span>
                <span className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.45 }}>
                  {n.body}
                </span>
                <span className="text-xs muted">{new Date(n.sent).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              </div>
            ))}
          </section>
        )}
      </div>
      <FamilyTabBar />
    </MobileScreen>
  );
}
