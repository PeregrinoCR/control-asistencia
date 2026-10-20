import { Icon } from './Icon';

interface SignaturePadProps {
  signed: boolean;
  signer: string;
  signedAt: string;
  onSign: () => void;
  onClear: () => void;
  height?: number;
}

/** Tap-to-sign box for guardians. Shows the captured signature with signer and time. */
export function SignaturePad({ signed, signer, signedAt, onSign, onClear, height = 110 }: SignaturePadProps) {
  if (!signed) {
    return (
      <button type="button" className="dropzone stack" style={{ height }} onClick={onSign}>
        <Icon name="pen" size={22} style={{ color: 'var(--blue)' }} />
        Toque para firmar con el dedo
      </button>
    );
  }
  return (
    <div
      className="stack between"
      style={{
        height,
        borderRadius: 'var(--radius-lg)',
        border: '1.5px solid var(--blue)',
        background: 'var(--surface)',
        padding: '8px 14px',
      }}
    >
      <svg
        width="200"
        height={height - 54}
        viewBox="0 0 200 56"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={`Firma de ${signer}`}
      >
        <path d="M8 40c10-22 18-30 22-24s-8 26-2 26 14-30 20-28-4 22 2 22 10-14 16-14 4 10 10 10 12-16 20-16 2 14 10 12 14-12 22-12 6 8 14 6 16-6 22-8" />
      </svg>
      <div className="row between text-xs muted">
        <span>
          {signer} · {signedAt}
        </span>
        <button type="button" className="btn btn--ghost" style={{ height: 32, padding: '0 10px', fontSize: 13 }} onClick={onClear}>
          Borrar
        </button>
      </div>
    </div>
  );
}
