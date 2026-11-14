import { AsyncLocalStorage } from 'node:async_hooks';

const RPC_URL = 'https://studio.genlayer.com/api';
type RequestContext = { beforeRequest?: () => Promise<void> };
type Bridge = { context: AsyncLocalStorage<RequestContext>; original: typeof fetch; queue: Promise<void>; times: number[] };
const runtime = globalThis as typeof globalThis & { fineprintStudioBridge?: Bridge };

async function reserve(bridge: Bridge) {
  const task = bridge.queue.then(async () => {
    let now = Date.now();
    bridge.times = bridge.times.filter((time) => now - time < 3600000);
    if (bridge.times.length >= 450) throw new Error('StudioNet read budget reached for this rolling hour. Retry after the oldest request expires.');
    const delay = Math.max(0, (bridge.times.at(-1) ?? 0) + 2500 - now);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    now = Date.now(); bridge.times.push(now);
  });
  bridge.queue = task.catch(() => undefined);
  await task;
}

function bridge() {
  if (runtime.fineprintStudioBridge) return runtime.fineprintStudioBridge;
  const value: Bridge = { context: new AsyncLocalStorage<RequestContext>(), original: globalThis.fetch.bind(globalThis), queue: Promise.resolve(), times: [] };
  runtime.fineprintStudioBridge = value;
  // SDK 1.1.8 sends non-wallet methods through fetch, ignoring config.provider.
  // Limit this bridge to SDK calls in our async context and the exact StudioNet RPC.
  globalThis.fetch = async (input, init) => {
    const context = value.context.getStore();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!context || url !== RPC_URL) return value.original(input, init);
    if (context.beforeRequest) await context.beforeRequest(); else await reserve(value);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('User-Agent', 'Mozilla/5.0 FinePrint/1.0');
    return value.original(input, { ...init, headers, signal: init?.signal ?? AbortSignal.timeout(25000) });
  };
  return value;
}

export function studioSdkRequest<T>(operation: () => Promise<T>, beforeRequest?: () => Promise<void>): Promise<T> {
  return bridge().context.run({ beforeRequest }, operation);
}
