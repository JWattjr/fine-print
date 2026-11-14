const STORAGE_KEY = 'fineprint:studio-budget:v1';
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 450;
const MIN_INTERVAL_MS = 2500;

let fallbackQueue: Promise<void> = Promise.resolve();

function history(): number[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((value): value is number => Number.isFinite(value)) : [];
  } catch {
    return [];
  }
}

function pause(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function reserveAndRun<T>(operation: () => Promise<T>): Promise<T> {
  let times = history().filter((timestamp) => Date.now() - timestamp < WINDOW_MS);
  if (times.length >= MAX_PER_HOUR) {
    throw new Error('Fine Print has used its safe StudioNet request budget for this rolling hour. Keep this transaction pending and try again later.');
  }

  const wait = times.length ? Math.max(0, times[times.length - 1] + MIN_INTERVAL_MS - Date.now()) : 0;
  if (wait) await pause(wait);

  const now = Date.now();
  times = history().filter((timestamp) => now - timestamp < WINDOW_MS);
  if (times.length >= MAX_PER_HOUR) {
    throw new Error('Fine Print has used its safe StudioNet request budget for this rolling hour. Keep this transaction pending and try again later.');
  }
  times.push(now);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(times));
  return operation();
}

export function withStudioRequestBudget<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof window === 'undefined') return operation();
  if (navigator.locks?.request) {
    return navigator.locks.request<Promise<T>>('fineprint:studio-request-budget', { mode: 'exclusive' }, () => reserveAndRun(operation)).then((result) => result);
  }

  const current = fallbackQueue.then(() => reserveAndRun(operation));
  fallbackQueue = current.then(() => undefined, () => undefined);
  return current;
}
