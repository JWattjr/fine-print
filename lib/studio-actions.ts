'use client';
import { getAddress } from 'viem';
import { connectStudioWallet } from '@/lib/wallet';
import { contractAddress, readbackMatches, type ContractName, type ReadSpec } from '@/lib/studio-contracts';
import { withStudioRequestBudget } from '@/lib/studio-budget';
import type { TxView } from '@/lib/transactions';

export type IntegerArgument = { integer: string };
export type ActionSpec = { key: string; label: string; contract: ContractName; method: string; args: Array<string | number | boolean | IntegerArgument>; valueWei?: string; expectedAccount?: string; historicalReplay?: boolean; recovery?: boolean; readback?: ReadSpec };
export type ActionRecord = ActionSpec & Partial<TxView> & { hash: string; account: string; submittedAt: string; stateVerified?: boolean; stateReadback?: unknown; readAt?: string; readError?: string; journalError?: string; sourceSha256?: string };
const KEY = 'fineprint:actions:v1';
const TX_KEY = 'fineprint:transactions:v1';
export function actionsSnapshot() { return typeof window === 'undefined' ? null : localStorage.getItem(KEY); }
export function actions(): ActionRecord[] {
  try {
    const value: unknown = JSON.parse(actionsSnapshot() ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is ActionRecord => !!item && typeof item === 'object' && /^0x[\da-fA-F]{64}$/.test(String(item.hash ?? '')) && typeof item.key === 'string' && !item.key.startsWith('script:')) : [];
  } catch { return []; }
}
export function subscribeActions(listener: () => void) {
  window.addEventListener('fineprint:transaction', listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener('fineprint:transaction', listener); window.removeEventListener('storage', listener); };
}

function save(record: ActionRecord) {
  const current = actions();
  const previous = current.find((item) => item.key === record.key);
  if (previous && previous.hash.toLowerCase() !== record.hash.toLowerCase()) throw new Error('A different transaction is already saved for this one-time action.');
  if (previous?.stage?.startsWith('FINALIZED') && !record.stage?.startsWith('FINALIZED')) return;
  if (previous?.readAt && (!record.readAt || record.readAt < previous.readAt)) record = { ...record, stateVerified: previous.stateVerified, stateReadback: previous.stateReadback, readAt: previous.readAt, readError: previous.readError };
  const next = [...current.filter((item) => item.key !== record.key), record];
  localStorage.setItem(KEY, JSON.stringify(next));
  let transactions: Record<string, unknown>[] = [];
  try { transactions = JSON.parse(localStorage.getItem(TX_KEY) ?? '[]') as Record<string, unknown>[]; } catch { /* Retain the action journal. */ }
  localStorage.setItem(TX_KEY, JSON.stringify([...transactions.filter((item) => item.hash !== record.hash), { label: record.historicalReplay ? 'Historical replay · ' + record.label : record.label, hash: record.hash, stage: record.stage ?? 'SUBMITTED', status: record.status ?? 'SUBMITTED', execution: record.execution ?? 'Awaiting execution', consensus: record.consensus ?? 'Awaiting consensus', stateVerified: record.stateVerified, stateReadback: record.stateReadback }]));
  window.dispatchEvent(new Event('fineprint:transaction'));
  void mirrorJournal(record);
}

let journalQueue: Promise<void> = Promise.resolve();
function mirrorJournal(record: ActionRecord): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return Promise.resolve();
  const task = journalQueue.then(async () => {
    let error = '';
    try {
      const response = await fetch('/api/internal/action-proof', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Disk journal is unavailable.');
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Disk journal is unavailable.'; }
    const latest = actions();
    const current = latest.find((item) => item.key === record.key);
    if (current && current.hash === record.hash) {
      localStorage.setItem(KEY, JSON.stringify(latest.map((item) => item.key === record.key ? { ...item, journalError: error } : item)));
      window.dispatchEvent(new Event('fineprint:transaction'));
    }
  });
  journalQueue = task.catch(() => undefined);
  return journalQueue;
}

export async function readStudio(spec: ReadSpec): Promise<{ value: unknown; readAt: string }> {
  const response = await withStudioRequestBudget(() => fetch('/api/studio/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(spec), cache: 'no-store' }));
  const payload = await response.json() as { ok: boolean; value?: unknown; readAt?: string; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'The finalized contract read is unavailable.');
  return { value: payload.value, readAt: payload.readAt ?? new Date().toISOString() };
}

async function submitUnlocked(spec: ActionSpec): Promise<ActionRecord> {
  const previous = actions().find((item) => item.key === spec.key);
  if (previous) return previous;
  if (actions().some((item) => !item.stage?.startsWith('FINALIZED'))) throw new Error('Wait for the current transaction to finalize before another wallet request.');
  if (!spec.recovery && actions().some(needsRefresh)) throw new Error('Wait for the finalized state readback, or use the deadline recovery control.');
  const address = contractAddress(spec.contract);
  if (!address && spec.method !== 'deploy') throw new Error('This contract has not been deployed yet.');
  const value = BigInt(spec.valueWei ?? '0');
  if (value < 0n || value > 100000000000000000n) throw new Error('Value exceeds the 0.1 GEN project cap.');
  if (spec.recovery && value !== 0n) throw new Error('Deadline recovery cannot attach a native deposit.');
  const wallet = await connectStudioWallet();
  if (spec.expectedAccount && wallet.account.toLowerCase() !== spec.expectedAccount.toLowerCase()) throw new Error(`Select the account that owns this record: ${spec.expectedAccount}`);
  const args = spec.args.map((arg) => {
    if (typeof arg !== 'object') return arg;
    if (!/^\d+$/.test(arg.integer)) throw new Error('An integer argument is invalid.');
    return BigInt(arg.integer);
  });
  let hash: `0x${string}`;
  let sourceSha256: string | undefined;
  if (spec.method === 'deploy') {
    if (address || value !== 0n || args.length || process.env.NODE_ENV !== 'development') throw new Error('Only an undeployed local zero-value contract may be deployed here.');
    const response = await fetch(`/api/internal/contract-code?name=${spec.contract}`, { cache: 'no-store' });
    const payload = await response.json() as { ok?: boolean; code?: string; sha256?: string; error?: string };
    if (!response.ok || !payload.ok || !payload.code || !payload.sha256) throw new Error(payload.error ?? 'Pinned contract source is unavailable.');
    sourceSha256 = payload.sha256;
    hash = await wallet.client.deployContract({ code: payload.code, args: [] });
  } else {
    hash = await wallet.client.writeContract({ address: getAddress(address!), functionName: spec.method, args, value });
  }
  const record: ActionRecord = { ...spec, hash, sourceSha256, account: wallet.account, submittedAt: new Date().toISOString(), stage: 'SUBMITTED', status: 'SUBMITTED', stateVerified: spec.readback ? false : undefined };
  save(record);
  await journalQueue;
  return record;
}

let submissionQueue: Promise<void> = Promise.resolve();
export async function submitAction(spec: ActionSpec): Promise<ActionRecord> {
  if (navigator.locks) return navigator.locks.request('fineprint-action-submit', () => submitUnlocked(spec));
  const request = submissionQueue.then(() => submitUnlocked(spec));
  submissionQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function refreshUnlocked(record: ActionRecord, forceState: boolean): Promise<void> {
  if (record.journalError) await mirrorJournal(record);
  let updated = record;
  if (!record.stage?.startsWith('FINALIZED')) {
    const response = await withStudioRequestBudget(() => fetch(`/api/studio/transactions/${record.hash}`, { cache: 'no-store' }));
    const payload = await response.json() as { ok: boolean; transaction?: TxView; error?: string };
    if (!response.ok || !payload.ok || !payload.transaction) throw new Error(payload.error ?? 'Receipt is not available yet.');
    updated = { ...record, ...payload.transaction };
    save(updated);
  }
  if (updated.stage === 'FINALIZED_SUCCESS' && updated.readback && (!updated.stateVerified || forceState)) {
    try {
      const { value, readAt } = await readStudio(updated.readback);
      const verified = readbackMatches(value, updated.readback);
      save({ ...updated, stateReadback: value, readAt, stateVerified: verified, readError: verified ? '' : 'The parent is finalized; its callback state is still pending.' });
    } catch (cause) {
      save({ ...updated, readError: cause instanceof Error ? cause.message : 'Finalized state readback is unavailable.' });
    }
  }
}

const refreshes = new Map<string, Promise<void>>();
export function refreshAction(record: ActionRecord, forceState = false): Promise<void> {
  const previous = refreshes.get(record.key);
  if (previous) return previous;
  const task = refreshUnlocked(record, forceState).finally(() => refreshes.delete(record.key));
  refreshes.set(record.key, task);
  return task;
}

export function needsRefresh(record: ActionRecord) { return !!record.journalError || !record.stage?.startsWith('FINALIZED') || (record.stage === 'FINALIZED_SUCCESS' && !!record.readback && !record.stateVerified); }

export async function restoreActionJournal() {
  if (process.env.NODE_ENV !== 'development') return;
  const response = await fetch('/api/internal/action-proof', { cache: 'no-store' });
  const payload = await response.json() as { ok?: boolean; actions?: ActionRecord[] };
  if (!response.ok || !payload.ok || !Array.isArray(payload.actions)) return;
  for (const record of payload.actions) {
    if (!actions().some((item) => item.key === record.key)) save(record);
  }
}
