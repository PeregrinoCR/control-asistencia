import type { ReactNode } from 'react';
import { ButtonLink, Icon, type IconName } from '../../components';
import { MobileScreen } from '../../layouts/MobileScreen';
import { SCHOOL_NAME } from '../../data/school';
import { routes } from '../../routes';

interface NotificationProps {
  icon: IconName;
  appColor?: string;
  source: string;
  when: string;
  title: string;
  body: string;
  opacity?: number;
  children?: ReactNode;
}

function Notification({ icon, appColor, source, when, title, body, opacity = 1, children }: NotificationProps) {
  return (
    <div className="notif" style={{ background: `rgba(247,248,245,${opacity})` }}>
      <div className="row gap-8">
        <span className="notif__app" style={appColor ? { background: appColor } : undefined}>
          <Icon name={icon} size={14} strokeWidth={2.4} />
        </span>
        <span className="notif__meta grow" style={{ fontWeight: 600 }}>
          {source}
        </span>
        <span className="notif__meta">{when}</span>
      </div>
      <div className="stack" style={{ gap: 3 }}>
        <span className="notif__title">{title}</span>
        <span className="notif__body">{body}</span>
      </div>
      {children}
    </div>
  );
}

/** Familia · Notificación instantánea (how alerts reach the guardian's lock screen) */
export function PushPreview() {
  return (
    <MobileScreen night>
      <div className="stack gap-14" style={{ flex: 1, padding: '40px 16px 24px', overflowY: 'auto' }}>
        <div className="stack gap-4" style={{ padding: '0 6px 10px' }}>
          <span className="eyebrow" style={{ letterSpacing: 0.8, color: 'var(--night-ink-3)' }}>
            Lunes 19 de octubre
          </span>
          <h1 className="display" style={{ fontSize: 28, letterSpacing: -0.4, lineHeight: 1.15 }}>
            El aviso llega segundos después del pase de lista
          </h1>
        </div>

        <Notification
          icon="checkSquare"
          source={`Asistencia · ${SCHOOL_NAME}`}
          when="ahora"
          title="Mateo fue marcado ausente"
          body="Matemática, 1.ª lección (6:12 p. m.) · Prof. Andrea Solís. Si ya lo sabía, puede justificar desde la app."
        >
          <div className="grid-2" style={{ paddingTop: 6 }}>
            <ButtonLink variant="primary" to={routes.family.justify}>
              Justificar
            </ButtonLink>
            <ButtonLink variant="quiet" to={routes.family.home}>
              Ver detalle
            </ButtonLink>
          </div>
        </Notification>

        <Notification
          icon="clock"
          opacity={0.92}
          source="Asistencia · Sofía (8-1)"
          when="6:21 p. m."
          title="Sofía llegó tarde"
          body="Ingresó a las 6:19 p. m., 19 minutos después del inicio de lecciones."
        />

        <Notification
          icon="check"
          appColor="var(--green)"
          opacity={0.82}
          source="Salida · Sofía (8-1)"
          when="7:57 p. m."
          title="Sofía salió del colegio"
          body="Salida temprana que usted autorizó para las 7:55 p. m. El guarda la registró en el portón."
        />

        <div
          className="stack gap-8"
          style={{ marginTop: 'auto', border: '1px dashed #4D5E70', borderRadius: 'var(--radius-2xl)', padding: '14px 16px' }}
        >
          <div className="row gap-8" style={{ color: 'var(--night-ink-2)' }}>
            <Icon name="message" size={18} />
            <span className="eyebrow" style={{ letterSpacing: 0.6, color: 'inherit' }}>
              Respaldo por SMS si no se abre la app en 10 min
            </span>
          </div>
          <span style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--night-ink)' }}>
            [COLEGIO]: Mateo Brenes fue marcado AUSENTE hoy 19/10 en la 1.ª lección. Justifique en [ENLACE CORTO] o llame
            al [TELÉFONO].
          </span>
        </div>
      </div>
    </MobileScreen>
  );
}
