'use client';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { actions, actionsSnapshot, refreshAction, subscribeActions, type ActionRecord } from '@/lib/studio-actions';
import { explorerTransaction } from '@/lib/explorer';

export function useActionRecord(key: string) {
  const snapshot = useSyncExternalStore(subscribeActions, actionsSnapshot, () => null);
  return useMemo(() => { void snapshot; return typeof window === 'undefined' ? undefined : actions().find((item) => item.key === key); }, [key, snapshot]);
}

export function useActionRecords() {
  const snapshot = useSyncExternalStore(subscribeActions, actionsSnapshot, () => null);
  return useMemo(() => { void snapshot; return typeof window === 'undefined' ? [] : actions(); }, [snapshot]);
}

export function ActionStatus({ record }: { record?: ActionRecord }) {
  const [error, setError] = useState('');
  if (!record) return null;
  return <div className="probe-card" role="status">
    {record.historicalReplay && <span className="tag red">Historical replay</span>}
    <div><strong>{record.label}</strong><span className="tag gray">{record.stage?.replaceAll('_', ' ')}</span></div>
    <a className="inline-link mono" href={explorerTransaction(record.hash)} target="_blank" rel="noreferrer">{record.hash} ↗</a>
    <small>{record.status} · {record.execution ?? 'Awaiting execution'} · {record.consensus ?? 'Awaiting consensus'}</small>
    {record.journalError && <p className="wallet-error">Hash saved in this browser. Disk journal retry pending: {record.journalError}</p>}
    {record.stage === 'ACCEPTED' && <p className="helper">Accepted; the native appeal window is still open.</p>}
    {record.stage === 'FINALIZED_SUCCESS' && record.readback && <small className={record.stateVerified ? 'state-ok' : 'quiet'}>{record.stateVerified ? `Finalized state read back ${record.readAt ? new Date(record.readAt).toLocaleTimeString() : ''}` : record.readError || 'Waiting for finalized callback state.'}</small>}
    {record.stateReadback !== undefined && <details><summary>Inspect finalized state</summary><pre>{JSON.stringify(record.stateReadback, null, 2)}</pre></details>}
    <button type="button" className="secondary-button" onClick={async () => { setError(''); try { await refreshAction(record, true); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Refresh is unavailable.'); } }}>Refresh saved transaction</button>
    {error && <p role="alert" className="wallet-error">{error}</p>}
  </div>;
}
