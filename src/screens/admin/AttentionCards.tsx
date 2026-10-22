import { ButtonAnchor, ButtonLink, EmptyState } from '../../components';

export interface AttentionItem {
  id: string;
  count: number;
  title: string;
  /** Two short lines of context: who, and what exactly. */
  lines: string[];
  /** "urgent" is orange and filled; "warn" is a plain card. */
  tone: 'urgent' | 'warn';
  cta: string;
  /** A page of the panel, or an anchor on this page. */
  to?: string;
  href?: string;
}

/** What needs the director's action right now, one card per kind of pending work. */
export function AttentionCards({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="atencion-t" className="stack gap-10">
      <h2 id="atencion-t" className="title-section">
        Requiere su atención
        {items.length > 0 && <span className="attn-sub"> · {items.length === 1 ? '1 pendiente' : `${items.length} pendientes`}</span>}
      </h2>
      {items.length === 0 ? (
        <div className="card">
          <EmptyState title="Todo al día">No hay listas sin pasar, justificaciones, salidas ni sustitutos pendientes ahora mismo.</EmptyState>
        </div>
      ) : (
        <div className="attn-grid">
          {items.map((it) => (
            <article key={it.id} className="attn-card" data-tone={it.tone}>
              <span className="attn-card__count">{it.count}</span>
              <strong className="attn-card__title">{it.title}</strong>
              <span className="attn-card__lines">
                {it.lines.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </span>
              {it.href ? (
                <ButtonAnchor variant={it.tone === 'urgent' ? 'danger' : 'outline-blue'} size="lg" href={it.href}>
                  {it.cta}
                </ButtonAnchor>
              ) : (
                <ButtonLink variant={it.tone === 'urgent' ? 'danger' : 'outline-blue'} size="lg" to={it.to ?? '#'}>
                  {it.cta}
                </ButtonLink>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
