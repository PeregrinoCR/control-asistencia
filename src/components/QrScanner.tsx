import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QrScannerProps {
  onScan: (text: string) => void;
  onClose: () => void;
}

/** Live camera preview that reports the first QR code it reads. Works on iOS and Android browsers. */
export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (done || !v || !ctx) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (code?.data) {
          done = true;
          onScan(code.data);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => undefined);
        }
        frame = requestAnimationFrame(tick);
      })
      .catch(() => setError('No se pudo abrir la cámara. Revise el permiso del navegador o digite el código del carné.'));
    if (!navigator.mediaDevices) setError('Este navegador no permite usar la cámara. Digite el código del carné.');

    return () => {
      done = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <div className="scanner">
      {error ? (
        <p className="scanner__error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <video ref={video} className="scanner__video" muted playsInline aria-label="Vista de la cámara" />
          <div className="scanner__frame" aria-hidden="true" />
        </>
      )}
      <button type="button" className="btn btn--secondary btn--md scanner__close" onClick={onClose}>
        Cerrar cámara
      </button>
    </div>
  );
}
