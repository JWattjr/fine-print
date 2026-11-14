'use client';
import { useEffect, useRef } from 'react';
import { actions, needsRefresh, refreshAction, restoreActionJournal } from '@/lib/studio-actions';

export function ActionMonitor() {
  const busy = useRef(false);
  useEffect(() => {
    void restoreActionJournal().catch(() => undefined);
    const timer = window.setInterval(async () => {
      if (busy.current) return;
      const pending = actions().find(needsRefresh);
      if (!pending) return;
      busy.current = true;
      try { await refreshAction(pending); } catch { /* Preserve the hash and retry on the next tick. */ }
      finally { busy.current = false; }
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
