import type { CSSProperties } from 'react';

interface SkeletonProps {
  /** Lines of text, or tiles like the KPI row. */
  variant?: 'tiles' | 'lines';
  count?: number;
  /** Tells assistive tech what is loading. */
  label?: string;
}

/** A quiet placeholder shown while data loads, so the page doesn't jump when it arrives. */
export function Skeleton({ variant = 'lines', count, label = 'Cargando' }: SkeletonProps) {
  const n = count ?? (variant === 'tiles' ? 4 : 5);
  const widths = ['100%', '92%', '84%', '96%', '70%'];
  return (
    <div role="status" aria-busy="true" aria-label={label} className="stack gap-12">
      {variant === 'tiles' ? (
        <div className="skeleton-tiles">
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className="skeleton skeleton-tile" />
          ))}
        </div>
      ) : (
        Array.from({ length: n }, (_, i) => <span key={i} className="skeleton skeleton-line" style={{ width: widths[i % widths.length] } as CSSProperties} />)
      )}
    </div>
  );
}
