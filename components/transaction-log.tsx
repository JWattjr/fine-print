'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { explorerTransaction } from '@/lib/explorer';
import { withStudioRequestBudget } from '@/lib/studio-budget';
import type { TxStage } from '@/lib/transactions';
import { actions } from '@/lib/studio-actions';

export type TransactionRow = {
  label: string;
  hash: string;
  stage: TxStage;
  status: string;
  execution: string;
  consensus: string;
  txReceipt?: string;
  stateVerified?: boolean;
  stateReadback?: unknown;
};

const TRANSACTION_KEY = 'fineprint:transactions:v1';
const PROBE_KEY = 'fineprint:archive-probe:v2';

function finalized(stage: string) { return stage === 'FINALIZED_SUCCESS' || stage === 'FINALIZED_ERROR'; }

function validRow(value: unknown): value is TransactionRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.label === 'string' && /^0x[\da-fA-F]{64}$/.test(String(row.hash ?? ''))
    && ['SUBMITTED', 'PENDING', 'ACCEPTED', 'FINALIZED_SUCCESS', 'FINALIZED_ERROR'].includes(String(row.stage));
}

function mergeRows(...sets: TransactionRow[][]): TransactionRow[] {
  const rows = new Map<string, TransactionRow>();
  for (const set of sets) {
    for (const row of set) {
      const key = row.hash.toLowerCase();
      const previous = rows.get(key);
      rows.set(key, previous ? { ...previous, ...row, stateReadback: row.stateReadback ?? previous.stateReadback, stateVerified: row.stateVerified ?? previous.stateVerified } : row);
    }
  }
  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function localRows(): TransactionRow[] {
  const rows: TransactionRow[] = [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(TRANSACTION_KEY) ?? '[]');
    if (Array.isArray(saved)) rows.push(...saved.filter(validRow));
  } catch { /* Ignore a damaged local journal and retain the static proof rows. */ }

  for (const action of actions()) rows.push({ label: action.historicalReplay ? 'Historical replay · ' + action.label : action.label, hash: action.hash, stage: action.stage ?? 'SUBMITTED', status: action.status ?? 'SUBMITTED', execution: action.execution ?? 'Awaiting execution', consensus: action.consensus ?? 'Awaiting consensus', stateVerified: action.stateVerified, stateReadback: action.stateReadback });

  try {
    const saved = JSON.parse(localStorage.getItem(PROBE_KEY) ?? 'null') as {
      deploy?: Record<string, unknown>;
      probes?: Record<string, Record<string, unknown>>;
    } | null;
    const append = (label: string, record?: Record<string, unknown>) => {
      if (!record || typeof record.hash !== 'string' || !/^0x[\da-fA-F]{64}$/.test(record.hash)) return;
      const receipt = record.receipt as Record<string, unknown> | undefined;
      rows.push({
        label,
        hash: record.hash,
        stage: (record.stage as TxStage) ?? 'SUBMITTED',
        status: String(receipt?.status ?? record.stage ?? 'SUBMITTED'),
        execution: String(receipt?.execution ?? 'Awaiting execution'),
        consensus: String(receipt?.consensus ?? 'Awaiting consensus'),
        txReceipt: typeof receipt?.txReceipt === 'string' ? receipt.txReceipt : undefined,
        stateVerified: typeof record.passed === 'boolean' ? record.passed : undefined,
        stateReadback: record.result,
      });
    };
    append('deploy-ArchiveProbe', saved?.deploy);
    for (const [id, record] of Object.entries(saved?.probes ?? {})) append(`probe-${id}`, record);
  } catch { /* Ignore malformed local probe state. */ }

  return rows;
}

export function TransactionLog({ initialRows }: { initialRows: TransactionRow[] }) {
  const rowsRef = useRef(initialRows);
  const [rows, setRows] = useState(initialRows);
  const [pollNotice, setPollNotice] = useState('');
  const refreshRef = useRef<(row: TransactionRow) => Promise<void>>(async () => {});

  const commit = useCallback((next: TransactionRow[]) => {
    rowsRef.current = next;
    setRows(next);
    localStorage.setItem(TRANSACTION_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    const sync = () => commit(mergeRows(initialRows, localRows()));
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('fineprint:probe', sync);
    window.addEventListener('fineprint:transaction', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('fineprint:probe', sync);
      window.removeEventListener('fineprint:transaction', sync);
    };
  }, [initialRows, commit]);

  useEffect(() => {
    refreshRef.current = async (row) => {
      try {
        const response = await withStudioRequestBudget(() => fetch(`/api/studio/transactions/${row.hash}`, { cache: 'no-store' }));
        const payload = await response.json() as { ok: boolean; transaction?: Omit<TransactionRow, 'label'>; error?: string };
        if (!response.ok || !payload.ok || !payload.transaction) throw new Error(payload.error ?? 'StudioNet transaction lookup is still pending.');
        const updated = { ...row, ...payload.transaction, label: row.label, stateReadback: row.stateReadback, stateVerified: row.stateVerified };
        commit(rowsRef.current.map((current) => current.hash.toLowerCase() === row.hash.toLowerCase() ? updated : current));
        setPollNotice('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Transaction polling failed.';
        if (message.includes('safe StudioNet request budget')) setPollNotice(message);
      }
    };
  }, [commit]);

  useEffect(() => {
    let cursor = 0;
    const timer = window.setInterval(() => {
      const monitored = new Set(actions().map((item) => item.hash.toLowerCase()));
      const active = rowsRef.current.filter((row) => !finalized(row.stage) && !monitored.has(row.hash.toLowerCase()));
      if (!active.length) return;
      const row = active[cursor % active.length];
      cursor += 1;
      void refreshRef.current(row);
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="transaction-list">
    {pollNotice && <p role="status" className="notice">{pollNotice}</p>}
    {rows.length ? rows.map((row) => <article className="transaction-row" key={`${row.label}-${row.hash}`}>
      <div className="transaction-heading"><strong>{row.label}</strong><span className={`tag ${row.stage === 'FINALIZED_SUCCESS' ? '' : row.stage === 'FINALIZED_ERROR' ? 'red' : 'gray'}`}>{row.stage.replaceAll('_', ' ')}</span></div>
      <span className="mono">{row.hash}</span>
      <p>{row.status} · {row.execution} · {row.consensus}</p>
      {row.txReceipt && <small className="mono">Receipt {row.txReceipt}</small>}
      {row.stateVerified !== undefined && <small className={row.stateVerified ? 'state-ok' : 'wallet-error'}>{row.stateVerified ? 'Contract state read back after finality' : 'State readback is not confirmed'}</small>}
      {row.stateReadback !== undefined && <details><summary>Finalized state readback</summary><pre>{JSON.stringify(row.stateReadback, null, 2)}</pre></details>}
      <a className="inline-link" href={explorerTransaction(row.hash)} target="_blank" rel="noreferrer">StudioNet transaction ↗</a>
    </article>) : <div className="transaction-card"><strong>Waiting for StudioNet transactions</strong><span className="status-pill">No activity</span></div>}
  </div>;
}
