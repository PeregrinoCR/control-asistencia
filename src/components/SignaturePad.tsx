import { useCallback, useState } from 'react';
import { Icon } from './Icon';

interface SignaturePadProps {
  /** The drawn signature as a PNG data URL; null while nothing is drawn. */
  value: string | null;
  onChange: (value: string | null) => void;
  signer: string;
  signedAt: string;
  height?: number;
}

/**
 * Box where a guardian draws the signature with a finger or the mouse. The drawing is kept as a PNG,
 * so the school sees the real signature and not a placeholder.
 */
export function SignaturePad({ value, onChange, signer, signedAt, height = 110 }: SignaturePadProps) {
  const [drawing, setDrawing] = useState(false);

  // The canvas is created again after clearing, so it is set up whenever it mounts (a stable ref: no redraw mid-stroke).
  const setup = useCallback((el: HTMLCanvasElement | null) => {
    if (!el) return;
    const box = el.getBoundingClientRect();
    el.width = box.width * 2;
    el.height = height * 2;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2933';
  }, [height]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext('2d');
    const p = at(e);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
    setDrawing(true);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const ctx = e.currentTarget.getContext('2d');
    const p = at(e);
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
  };

  // Saves the drawing when the stroke ends, so the form knows there is a signature.
  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    setDrawing(false);
    onChange(e.currentTarget.toDataURL('image/png'));
  };

  if (!value) {
    return (
      <div className="stack gap-4">
        <canvas
          ref={setup}
          role="img"
          aria-label={`Área para firmar, ${signer}`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          style={{ width: '100%', height, touchAction: 'none', borderRadius: 'var(--radius-lg)', border: '1.5px dashed var(--blue)', background: 'var(--surface)', cursor: 'crosshair' }}
        />
        <span className="text-xs muted row gap-4">
          <Icon name="pen" size={14} /> Firme con el dedo o el mouse, dentro del recuadro.
        </span>
      </div>
    );
  }

  return (
    <div
      className="stack between"
      style={{ height, borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--blue)', background: 'var(--surface)', padding: '8px 14px' }}
    >
      <img src={value} alt={`Firma de ${signer}`} style={{ height: height - 54, maxWidth: '100%', objectFit: 'contain', alignSelf: 'flex-start' }} />
      <div className="row between text-xs muted">
        <span>
          {signer} · {signedAt}
        </span>
        <button type="button" className="btn btn--ghost" style={{ height: 32, padding: '0 10px', fontSize: 13 }} onClick={() => onChange(null)}>
          Borrar
        </button>
      </div>
    </div>
  );
}
