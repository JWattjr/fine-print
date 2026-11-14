'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribeActions } from '@/lib/studio-actions';

export function useStoredId(key: string) {
  const value = useSyncExternalStore(subscribeActions, () => localStorage.getItem(key) ?? '', () => '');
  const save = (id: string) => { localStorage.setItem(key, id); window.dispatchEvent(new Event('fineprint:transaction')); };
  return [value, save] as const;
}

export function newRecordId(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`; }

export function useClock() {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 10000); return () => window.clearInterval(timer); }, []);
  return clock;
}
