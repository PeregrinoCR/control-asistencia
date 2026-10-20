import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  value: string;
  size?: number;
  label: string;
}

/** Renders `value` as a QR code (SVG), dark on white so any camera reads it. */
export function QrCode({ value, size = 200, label }: QrCodeProps) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#17222e', light: '#ffffff' } }).then(
      (s) => live && setSvg(s),
    );
    return () => {
      live = false;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      style={{ width: size, height: size, background: '#fff', borderRadius: 'var(--radius-md)', padding: 6 }}
      // The SVG comes from the qrcode library and only encodes `value`.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
