import { useState } from 'react';
import { Icon } from './Icon';

interface SinpePaymentProps {
  amount: string;
  /** SINPE Móvil number the school receives payments on. */
  number: string;
  holder: string;
  /** Text the family writes as the transfer description, so the school can match it. */
  reference: string;
  receipt: string | null;
  /** Receives the chosen file's name, or null when removed; the file itself comes as the second argument. */
  onReceipt: (fileName: string | null, file?: File) => void;
}

/**
 * Manual SINPE Móvil payment: the family pays from its bank app and uploads the receipt;
 * the school confirms it from the admin panel. No bank integration involved.
 */
export function SinpePayment({ amount, number, holder, reference, receipt, onReceipt }: SinpePaymentProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="card card--mobile gap-12" aria-labelledby="pago-t">
      <div className="row between gap-8">
        <h2 id="pago-t" className="title-card">
          Pago por SINPE Móvil
        </h2>
        <span className={receipt ? 'badge badge--blue' : 'badge badge--amber'}>{receipt ? 'En revisión' : 'Pendiente'}</span>
      </div>
      <div className="stack gap-8" style={{ fontSize: 14 }}>
        <div className="row between gap-8">
          <span className="muted">Monto</span>
          <span className="strong">{amount}</span>
        </div>
        <div className="row between gap-8">
          <span className="muted">Número SINPE</span>
          <span className="row gap-8">
            <span className="strong tabular">{number}</span>
            <button type="button" className="btn btn--ghost" style={{ height: 32, padding: '0 6px', fontSize: 13 }} onClick={() => copy('number', number)}>
              {copied === 'number' ? 'Copiado' : 'Copiar'}
            </button>
          </span>
        </div>
        <div className="row between gap-8">
          <span className="muted">A nombre de</span>
          <span className="strong" style={{ textAlign: 'right' }}>{holder}</span>
        </div>
        <div className="row between gap-8">
          <span className="muted">Descripción</span>
          <span className="row gap-8">
            <span className="strong">{reference}</span>
            <button type="button" className="btn btn--ghost" style={{ height: 32, padding: '0 6px', fontSize: 13 }} onClick={() => copy('ref', reference)}>
              {copied === 'ref' ? 'Copiado' : 'Copiar'}
            </button>
          </span>
        </div>
      </div>
      {receipt ? (
        <div className="row gap-10" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
          <Icon name="fileCheck" style={{ color: 'var(--blue)' }} />
          <span className="stack grow">
            <span style={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{receipt}</span>
            <span className="text-xs muted">El colegio confirmará el pago</span>
          </span>
          <button type="button" className="btn btn--ghost" style={{ height: 32, padding: '0 6px', fontSize: 13 }} onClick={() => onReceipt(null)}>
            Quitar
          </button>
        </div>
      ) : (
        <label className="dropzone" style={{ minHeight: 56, gap: 10, cursor: 'pointer', fontSize: 14 }}>
          <Icon name="upload" size={20} style={{ color: 'var(--blue)' }} />
          Subir comprobante (foto o PDF)
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              onReceipt(file?.name ?? null, file);
            }}
          />
        </label>
      )}
      <span className="text-xs muted">Puede autorizar la gira ahora y pagar después.</span>
    </section>
  );
}
