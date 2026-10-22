import { useCallback, useRef, useState } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

interface SignaturePadProps {
  /** The confirmed signature as a PNG data URL; null while nothing is confirmed. */
  value: string | null;
  onChange: (value: string | null) => void;
  signer: string;
  signedAt: string;
  height?: number;
}

/**
 * Box where a guardian draws the signature with a finger or the mouse. The strokes stay editable until
 * "Confirmar firma" saves them as a PNG, so the school keeps the real signature.
 */
export function SignaturePad({ value, onChange, signer, signedAt, height = 110 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  // Set up once, when the canvas mounts (a stable ref, so strokes are not reset by re-renders).
  const setup = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
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
    },
    [height],
  );

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
    drawing.current = true;
  };

  // Each movement adds to the same stroke: lifting the finger only ends that stroke, the box stays editable.
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    const p = at(e);
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
    setHasStrokes(true);
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const el = canvasRef.current;
    el?.getContext('2d')?.clearRect(0, 0, el.width / 2, el.height / 2);
    setHasStrokes(false);
  };

  const confirm = () => {
    if (canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'));
  };

  if (!value) {
    return (
      <div className="stack gap-6">
        <canvas
          ref={setup}
          role="img"
          aria-label={`Área para firmar, ${signer}`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{ width: '100%', height, touchAction: 'none', borderRadius: 'var(--radius-lg)', border: '1.5px dashed var(--blue)', background: 'var(--surface)', cursor: 'crosshair' }}
        />
        <div className="row between wrap gap-8">
          <span className="text-xs muted row gap-4">
            <Icon name="pen" size={14} /> Firme dentro del recuadro. Puede corregir con «Borrar».
          </span>
          <div className="row gap-8">
            <Button style={{ height: 36, fontSize: 14 }} onClick={clear} disabled={!hasStrokes}>
              Borrar
            </Button>
            <Button variant="primary" style={{ height: 36, fontSize: 14 }} onClick={confirm} disabled={!hasStrokes}>
              Confirmar firma
            </Button>
          </div>
        </div>
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
          Cambiar firma
        </button>
      </div>
    </div>
  );
}
