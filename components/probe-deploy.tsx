'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { decodeLocalnetTransaction } from 'genlayer-js';
import { getAddress } from 'viem';
import { TransactionHashVariant, type TransactionHash } from 'genlayer-js/types';
import { Topline } from '@/components/topline';
import { cdxUrl, PROBE_SOURCES, snapshotUrl, type ProbeSource } from '@/lib/probe-sources';
import { explorerAddress, explorerTransaction } from '@/lib/explorer';
import { connectStudioWallet, readConnectedStudioWallet } from '@/lib/wallet';

type Stage = 'SUBMITTED' | 'PENDING' | 'ACCEPTED' | 'FINALIZED_SUCCESS' | 'FINALIZED_ERROR';
type ReceiptSummary = { status: string; execution: string; consensus: string; txReceipt?: string };
type ProbeRecord = { hash: string; sentAt: string; stage: Stage; account: string; receipt?: ReceiptSummary; result?: Record<string, unknown>; passed?: boolean };
type StoredState = { account?: string; sourceSha256?: string; deploy?: ProbeRecord; contractAddress?: string; probes: Record<string, ProbeRecord> };
type PendingTransaction = { kind: 'deploy'; record: ProbeRecord } | { kind: 'probe'; id: string; record: ProbeRecord };

const STORAGE_KEY = 'fineprint:archive-probe:v2';
const INITIAL: StoredState = { probes: {} };

function subscribe(listener: () => void) {
  window.addEventListener('fineprint:probe', listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener('fineprint:probe', listener);
    window.removeEventListener('storage', listener);
  };
}

function getSnapshot() { return localStorage.getItem(STORAGE_KEY); }
function getServerSnapshot() { return null; }
function save(value: StoredState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event('fineprint:probe'));
}

function storedState(raw: string | null): StoredState {
  if (!raw) return INITIAL;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return { ...INITIAL, ...parsed, probes: parsed.probes ?? {} };
  } catch {
    return INITIAL;
  }
}

function named(value: unknown, names: Record<string, string>) {
  const raw = String(value ?? '').toUpperCase();
  return names[raw] ?? raw;
}

function rankStage(stage: Stage) {
  return stage === 'FINALIZED_SUCCESS' || stage === 'FINALIZED_ERROR' ? 3 : stage === 'ACCEPTED' ? 2 : stage === 'PENDING' ? 1 : 0;
}

function receiptStage(receipt: Record<string, unknown>): { stage: Stage; summary: ReceiptSummary } {
  const status = named(receipt.statusName ?? receipt.status_name ?? receipt.status, {
    '0': 'UNINITIALIZED', '1': 'PENDING', '2': 'PROPOSING', '3': 'COMMITTING', '4': 'REVEALING',
    '5': 'ACCEPTED', '6': 'UNDETERMINED', '7': 'FINALIZED',
  });
  const leader = (receipt.consensus_data as { leader_receipt?: Array<{ execution_result?: string; vote?: string | null }> } | undefined)?.leader_receipt?.filter((round) => !round.vote).at(-1);
  const execution = named(receipt.txExecutionResultName ?? receipt.tx_execution_result ?? receipt.txExecutionResult ?? leader?.execution_result, {
    '0': 'NOT_VOTED', '1': 'FINISHED_WITH_RETURN', '2': 'FINISHED_WITH_ERROR',
    SUCCESS: 'FINISHED_WITH_RETURN', ERROR: 'FINISHED_WITH_ERROR',
  });
  const consensus = named(receipt.resultName ?? receipt.result_name ?? receipt.result, {
    '0': 'IDLE', '1': 'AGREE', '2': 'DISAGREE', '3': 'TIMEOUT', '4': 'DETERMINISTIC_VIOLATION',
    '5': 'NO_MAJORITY', '6': 'MAJORITY_AGREE', '7': 'MAJORITY_DISAGREE',
  });
  const stage: Stage = status !== 'FINALIZED'
    ? status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING'
    : execution === 'FINISHED_WITH_RETURN' && ['AGREE', 'MAJORITY_AGREE', 'SUCCESS'].includes(consensus)
      ? 'FINALIZED_SUCCESS'
      : 'FINALIZED_ERROR';
  return { stage, summary: { status, execution, consensus, txReceipt: String(receipt.txReceipt ?? receipt.tx_receipt ?? '') || undefined } };
}

function validProbe(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) as Record<string, unknown> : value as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function probePassed(result: Record<string, unknown> | null) {
  return !!result && result.cdx_status === 200 && result.cdx_match === true && result.snapshot_status === 200
    && Number(result.snapshot_chars) > 1000 && result.archive_marker === true;
}

async function journal(payload: Record<string, unknown>) {
  const response = await fetch('/api/internal/proof', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('The proof journal did not acknowledge the saved transaction. The hash remains in this browser.');
}

export function ProbeDeploy() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const state = useMemo(() => storedState(raw), [raw]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const refreshing = useRef(false);
  const pending = useMemo<PendingTransaction | null>(() => {
    if (state.deploy && !state.deploy.stage.startsWith('FINALIZED')) return { kind: 'deploy', record: state.deploy };
    const probe = Object.entries(state.probes).find(([, record]) => !record.stage.startsWith('FINALIZED'));
    return probe ? { kind: 'probe', id: probe[0], record: probe[1] } : null;
  }, [state.deploy, state.probes]);
  const readback = useMemo<PendingTransaction | null>(() => {
    const probe = Object.entries(state.probes).find(([, record]) => record.stage === 'FINALIZED_SUCCESS' && record.result === undefined && record.passed === undefined);
    return probe ? { kind: 'probe', id: probe[0], record: probe[1] } : null;
  }, [state.probes]);

  const deploy = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const wallet = await connectStudioWallet();
      const response = await fetch('/api/internal/probe-code');
      if (!response.ok) throw new Error('The local probe source endpoint is unavailable.');
      const payload = await response.json() as { code: string; sha256: string };
      setFingerprint(payload.sha256);
      const hash = await wallet.client.deployContract({ code: payload.code, args: [] });
      const record: ProbeRecord = { hash, sentAt: new Date().toISOString(), stage: 'SUBMITTED', account: wallet.account };
      const next = { ...state, account: wallet.account, sourceSha256: payload.sha256, deploy: record };
      save(next);
      await journal({ label: 'deploy-ArchiveProbe', hash, account: wallet.account, sourceSha256: payload.sha256, stage: 'SUBMITTED' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Deployment request failed.');
    } finally { setBusy(false); }
  }, [state]);

  const runProbe = useCallback(async (source: ProbeSource) => {
    if (!state.contractAddress || state.probes[source.id]) return;
    setBusy(true); setError('');
    try {
      const wallet = await connectStudioWallet();
      const hash = await wallet.client.writeContract({
        address: getAddress(state.contractAddress),
        functionName: 'probe',
        args: [source.id, source.original, cdxUrl(source), snapshotUrl(source), source.timestamp],
        value: 0n,
      }) as string;
      const record: ProbeRecord = { hash, sentAt: new Date().toISOString(), stage: 'SUBMITTED', account: wallet.account };
      const next = { ...state, account: wallet.account, probes: { ...state.probes, [source.id]: record } };
      save(next);
      await journal({ label: `probe-${source.id}`, hash, account: wallet.account, stage: 'SUBMITTED' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Probe transaction was not submitted.');
    } finally { setBusy(false); }
  }, [state]);

  const refresh = useCallback(async () => {
    const target = pending ?? readback;
    if (!target || refreshing.current) return;
    refreshing.current = true;
    setBusy(true); setError('');
    let finalizedProbeReadback = false;
    try {
      const { client } = await readConnectedStudioWallet();
      const record = target.record;
      const rawReceipt = await client.getTransaction({ hash: record.hash as TransactionHash });
      const receipt = decodeLocalnetTransaction(rawReceipt as never) as unknown as Record<string, unknown>;
      const { stage, summary } = receiptStage(receipt);
      let next = state;
      let payload: Record<string, unknown> = {
        label: target.kind === 'deploy' ? 'deploy-ArchiveProbe' : `probe-${target.id}`,
        hash: record.hash,
        account: record.account,
        stage,
        receipt: summary,
      };
      if (target.kind === 'deploy' && stage === 'FINALIZED_SUCCESS') {
        const decoded = receipt.txDataDecoded as { contractAddress?: string } | undefined;
        const data = receipt.data as { contract_address?: string } | undefined;
        const contractAddress = decoded?.contractAddress ?? data?.contract_address ?? String(receipt.to_address ?? receipt.recipient ?? '');
        if (!/^0x[\da-fA-F]{40}$/.test(contractAddress)) throw new Error('Deployment finalized, but StudioNet returned no contract address. The transaction hash is preserved.');
        next = { ...state, contractAddress };
        payload = { ...payload, contractAddress };
      }
      if (target.kind === 'probe' && stage === 'FINALIZED_SUCCESS' && state.contractAddress) {
        const { id } = target;
        finalizedProbeReadback = true;
        // Persist finality first. A state-query failure must not leave a finalized
        // transaction looking accepted or make the user submit it again.
        const finalizedRecord = { ...record, stage, receipt: summary };
        next = { ...state, probes: { ...state.probes, [id]: finalizedRecord } };
        save(next);
        await journal(payload);
        // StudioNet's contract-state lookup requires checksum address casing.
        const value = await client.readContract({
          address: getAddress(state.contractAddress),
          functionName: 'get_probe',
          args: [id],
          transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
        });
        const result = validProbe(value);
        const passed = probePassed(result);
        const updated: ProbeRecord = { ...finalizedRecord, result: result ?? { error: 'Probe state did not decode.' }, passed };
        next = { ...state, probes: { ...state.probes, [id]: updated } };
        payload = { ...payload, result: result ?? { error: 'Probe state did not decode.' }, passed };
      } else if (target.kind === 'deploy') {
        next = { ...state, deploy: { ...record, stage, receipt: summary } };
      } else {
        const { id } = target;
        next = { ...state, probes: { ...state.probes, [id]: { ...record, stage, receipt: summary } } };
      }
      save(next);
      await journal(payload);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'The receipt or state readback is temporarily unavailable.';
      setError(finalizedProbeReadback || !!readback || (pending?.kind === 'probe' && pending.record.stage === 'FINALIZED_SUCCESS')
        ? `The transaction is finalized. Probe state readback failed: ${detail} Retry the readback; the saved hash is safe.`
        : detail || 'Receipt is not available yet. The saved hash is safe to refresh.');
    } finally { refreshing.current = false; setBusy(false); }
  }, [pending, readback, state]);

  useEffect(() => {
    if (!pending && !readback) return;
    const timer = window.setInterval(() => { void refresh(); }, 10000);
    return () => window.clearInterval(timer);
  }, [pending, readback, refresh]);

  useEffect(() => {
    if (!state.deploy) return;
    let cancelled = false;
    void fetch('/api/internal/proof', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return null;
      return await response.json() as {
        ok: boolean;
        deployment?: { hash?: string; stage?: Stage; receipt?: ReceiptSummary; sourceSha256?: string; contractAddress?: string };
        probes?: Record<string, { hash?: string; stage?: Stage; receipt?: ReceiptSummary; result?: Record<string, unknown>; passed?: boolean; recordedAt?: string }>;
      };
    }).then((journalState) => {
      if (cancelled || !journalState?.ok) return;
      let next = state;
      const deployment = journalState.deployment;
      if (state.deploy && deployment?.hash && deployment.hash.toLowerCase() === state.deploy.hash.toLowerCase()) {
        const currentDeploy = state.deploy;
        const stage = deployment.stage ?? currentDeploy.stage;
        next = {
          ...next,
          sourceSha256: next.sourceSha256 ?? deployment.sourceSha256,
          ...(stage && rankStage(stage) >= rankStage(next.deploy?.stage ?? 'SUBMITTED') ? {
            deploy: { ...currentDeploy, stage, ...(deployment.receipt ? { receipt: deployment.receipt } : {}) },
          } : {}),
          ...(stage === 'FINALIZED_SUCCESS' && /^0x[\da-fA-F]{40}$/.test(deployment.contractAddress ?? '') ? { contractAddress: deployment.contractAddress } : {}),
        };
      }
      const probes = { ...next.probes };
      for (const [id, record] of Object.entries(journalState.probes ?? {})) {
        if (!record.hash || !record.stage) continue;
        const previous = probes[id];
        if (previous && previous.hash.toLowerCase() !== record.hash.toLowerCase()) continue;
        if (!previous || rankStage(record.stage) >= rankStage(previous.stage)) {
          probes[id] = {
            hash: record.hash,
            sentAt: previous?.sentAt ?? record.recordedAt ?? new Date().toISOString(),
            account: previous?.account ?? state.account ?? '',
            stage: record.stage,
            ...(record.receipt ? { receipt: record.receipt } : {}),
            ...(record.result ? { result: record.result } : {}),
            ...(typeof record.passed === 'boolean' ? { passed: record.passed } : {}),
          };
        }
      }
      next = { ...next, probes };
      if (JSON.stringify(next) !== JSON.stringify(state)) save(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [state]);

  const allPassed = PROBE_SOURCES.every((source) => state.probes[source.id]?.stage === 'FINALIZED_SUCCESS' && state.probes[source.id]?.passed === true);
  const deploymentFinal = state.deploy?.stage === 'FINALIZED_SUCCESS' && !!state.contractAddress;

  return <>
    <Topline />
    <div className="page">
      <header className="subhead">
        <div><h1>Wayback access probe</h1><p>One zero-value deployment checks whether StudioNet validators can read the exact CDX rows and immutable id_ snapshots used in the historical cases.</p></div>
        <span className={`tag ${allPassed ? '' : 'red'}`}>{allPassed ? `All ${PROBE_SOURCES.length} sources verified` : 'Archive verification required'}</span>
      </header>
      <div className="form-layout">
        <section className="form-stack">
          <div className="notice">
            <strong>Wallet action: deploy ArchiveProbe</strong><br />
            Network: StudioNet · chain 61999<br />GEN value: 0 wei<br />
            Source: <code>contracts/archive_probe.py</code> · runner pinned<br />
            Source fingerprint: <code>{fingerprint ? fingerprint.slice(0, 12) : state.sourceSha256?.slice(0, 12) ?? 'Loaded on submit'}</code>
          </div>
          <p className="helper">The wallet signs each transaction. Fine Print saves each hash before polling it every 10 seconds. A source can only be submitted once from this screen.</p>
          {!state.deploy && <button className="primary-button" disabled={busy} onClick={deploy}>{busy ? 'Opening wallet…' : 'Connect wallet and deploy probe'}</button>}
          {state.deploy && <div className="probe-card">
            <div><strong>Probe deployment</strong><span className="status-pill">{state.deploy.stage}</span></div>
            <span className="mono">{state.deploy.hash}</span>
            <a className="inline-link" href={explorerTransaction(state.deploy.hash)} target="_blank" rel="noreferrer">Open StudioNet transaction ↗</a>
            {state.contractAddress && <a className="inline-link mono" href={explorerAddress(state.contractAddress)} target="_blank" rel="noreferrer">Contract {state.contractAddress} ↗</a>}
          </div>}
          {!deploymentFinal && state.deploy && <button className="secondary-button" disabled={busy} onClick={refresh}>{busy ? 'Reading receipt…' : 'Refresh saved deployment receipt'}</button>}
          <div className="probe-list">
            <div className="section-label">Validator fetch checks <span className="quiet">CDX row + id_ snapshot</span></div>
            {PROBE_SOURCES.map((source) => {
              const record = state.probes[source.id];
              const canRun = deploymentFinal && !record && !pending && !readback && !busy;
              return <article className="probe-source-card" key={source.id}>
                <div className="probe-source-heading"><div><strong>{source.company}</strong><span>{source.label}</span></div><span className={`tag ${record?.passed ? '' : record?.stage === 'FINALIZED_ERROR' || record?.passed === false ? 'red' : 'gray'}`}>{record?.passed ? 'verified' : record?.stage ?? 'not run'}</span></div>
                <p>{source.reason}</p>
                {record && <><span className="mono">{record.hash}</span>{record.receipt && <small>Receipt: {record.receipt.status} · {record.receipt.execution} · {record.receipt.consensus}</small>}{record.result && <small>CDX {String(record.result.cdx_status)} / exact row {String(record.result.cdx_match)} · snapshot {String(record.result.snapshot_status)} / {String(record.result.snapshot_chars)} chars · gzip {String(record.result.gzip)}</small>}<a className="inline-link" href={explorerTransaction(record.hash)} target="_blank" rel="noreferrer">Open probe transaction ↗</a></>}
                {!record && <button className="secondary-button" disabled={!canRun} onClick={() => void runProbe(source)}>{canRun ? 'Sign source check' : deploymentFinal ? readback ? 'Waiting for finalized state readback' : pending ? 'Waiting for current receipt' : 'Ready after current transaction' : 'Available after probe deployment'}</button>}
              </article>;
            })}
          </div>
          {(pending || readback) && <button className="secondary-button" disabled={busy} onClick={refresh}>{busy ? 'Reading receipt…' : readback && !pending ? 'Retry finalized probe state readback' : 'Refresh current transaction now'}</button>}
          {allPassed && <div className="notice success-notice"><strong>Validator access confirmed for every recorded case snapshot.</strong><br />Main contracts can now be prepared. The source checks remain on-chain in the ArchiveProbe state.</div>}
          {error && <p role="alert" className="notice wallet-error">{error}</p>}
          <Link href="/" className="inline-link">← Return to the policy desk</Link>
        </section>
        <aside className="form-aside">
          <h3>What this proves</h3>
          <p>For each exact capture, the leader and validators fetch the CDX index and archived id_ URL independently. The contract requires an exact timestamp, original URL and HTTP 200 row, detects gzip bytes and checks the archived response is a substantial HTML document.</p>
          <h3>Native appeal window</h3>
          <p>A result is counted only after StudioNet reports FINALIZED with successful execution and agreement. Fine Print keeps each transaction pending through the network appeal process; accepted or undecided transactions stay visible and are not treated as evidence.</p>
          <h3>Deployment value</h3>
          <p>ArchiveProbe deployment and source checks send zero GEN. Bounty and bond deposits are separate and require owner approval before the first deposit.</p>
        </aside>
      </div>
    </div>
  </>;
}
