import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type PushState = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' | 'not-ready';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function urlB64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Whether this phone gets the school's notifications, and a way to turn them on or off. */
export function usePush() {
  const [state, setState] = useState<PushState>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setState(isIos() && !installed() ? 'ios-install' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    })();
  }, []);

  const enable = async () => {
    setError('');
    try {
      const { data: key } = await supabase!.rpc('vapid_publica');
      if (!key) return setState('not-ready');
      if ((await Notification.requestPermission()) !== 'granted') return setState('denied');
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key as string) });
      const json = sub.toJSON();
      const { data: user } = await supabase!.auth.getUser();
      const { error } = await supabase!
        .from('suscripciones')
        .upsert({ endpoint: json.endpoint, usuario_id: user.user!.id, claves: json.keys }, { onConflict: 'endpoint' });
      if (error) throw new Error(error.message);
      setState('on');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const disable = async () => {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) {
      await supabase!.from('suscripciones').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    setState('off');
  };

  return { state, error, enable, disable };
}
