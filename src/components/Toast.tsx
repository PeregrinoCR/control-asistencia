import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

type Notify = (text: string) => void;

const ToastContext = createContext<Notify>(() => {});

/** Short "Guardado" style messages that fade on their own, so success never needs a permanent line on the page. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback<Notify>((text) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), text });
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="toast">
            <Icon name="check" size={18} strokeWidth={2.4} />
            <span>{toast.text}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export interface FlashMessage {
  ok: boolean;
  text: string;
}

/**
 * Drop-in for `useState<FlashMessage | null>`: a success message becomes a toast that fades,
 * an error stays on the page next to the form until the next attempt.
 */
export function useFlash() {
  const notify = useToast();
  const [msg, set] = useState<FlashMessage | null>(null);
  const setMsg = useCallback(
    (m: FlashMessage | null) => {
      if (m?.ok) {
        notify(m.text);
        set(null);
      } else set(m);
    },
    [notify],
  );
  return [msg, setMsg] as const;
}
