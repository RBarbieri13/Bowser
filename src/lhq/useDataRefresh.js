import { useCallback, useEffect, useRef, useState } from 'react';
export const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
/** Reload published data, not a claim that an upstream import ran in the browser. */
export function useDataRefresh(yahoo, ownership) {
  const [version, setVersion] = useState(0), [busy, setBusy] = useState(false);
  const latest = useRef({ yahoo, ownership }), running = useRef(false), last = useRef(Date.now());
  latest.current = { yahoo, ownership };
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true; setBusy(true); last.current = Date.now();
    setVersion(n => n + 1);
    try {
      // Discovery revalidates account membership before unlocking saved ownership.
      latest.current.ownership.refresh();
      await latest.current.yahoo.load();
    } finally { running.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    const wake = () => { if (document.visibilityState !== 'hidden' && Date.now() - last.current >= DAILY_REFRESH_MS) refresh(); };
    const timer = setInterval(wake, 60000);
    document.addEventListener('visibilitychange', wake);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', wake); };
  }, [refresh]);
  return { version, refresh, busy };
}
