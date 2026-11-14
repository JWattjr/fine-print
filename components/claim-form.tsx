'use client';
import { useState } from 'react';
import { ActionStatus, useActionRecord } from '@/components/action-status';
import { PreparedBond } from '@/components/prepared-bond';
import { SettlementControls } from '@/components/settlement-controls';
import { contractsDeployed } from '@/lib/studio-contracts';
import { newRecordId, useStoredId } from '@/lib/form-storage';
import { readStudio, submitAction } from '@/lib/studio-actions';

type Preflight = { ok: boolean; presentInNew?: boolean; absentFromBaseline?: boolean; baselineDigest?: string; newDigest?: string; error?: string };
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }

export function ClaimForm({ initialWatch }: { initialWatch: string }) {
  const [id, saveId] = useStoredId('fineprint:claim-draft');
  const prepared = useActionRecord(`claim:prepare:${id}`);
  const judgment = useActionRecord(`claim:judge:${id}`);
  const timeout = useActionRecord(`CLAIM:timeout:${id}`);
  const [watchId, setWatchId] = useState(initialWatch);
  const [watch, setWatch] = useState<Record<string, unknown> | null>(null);
  const [later, setLater] = useState('');
  const [passage, setPassage] = useState('');
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const record = object(timeout?.stateVerified ? timeout.stateReadback : judgment?.stateVerified ? judgment.stateReadback : prepared?.stateReadback);
  const replay = watch?.historical_replay === true || prepared?.historicalReplay === true;

  async function loadWatch() {
    setBusy(true); setError(''); setPreflight(null);
    try { const result = await readStudio({ contract: 'Watches', method: 'get_watch', args: [String(record.watch_id ?? watchId)] }); const value = object(result.value); if (!value.id || value.finalized !== true) throw new Error('This watch is not present in finalized StudioNet state.'); setWatch(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Watch read failed.'); } finally { setBusy(false); }
  }

  return <section className="form-stack">
    {!contractsDeployed() && <p className="notice">Contract deployment verification is pending. Archive previews remain available after a watch baseline can be loaded.</p>}
    {replay && <span className="tag red">Historical replay · past as-of baseline</span>}
    <div className="field"><label htmlFor="watch">Watch ID</label><input id="watch" value={String(record.watch_id ?? watchId)} onChange={(event) => { setWatchId(event.target.value); setWatch(null); setPreflight(null); }} readOnly={!!prepared} placeholder="w_…" /></div>
    <button type="button" className="secondary-button" disabled={busy || !contractsDeployed() || (!record.watch_id && !watchId)} onClick={loadWatch}>{busy ? 'Reading archive state…' : 'Load frozen watch'}</button>
    {watch && <div className="notice"><strong>{String(watch.concern)}</strong><ol>{Array.isArray(watch.criteria) && watch.criteria.map((criterion, index) => <li key={index}>{String(criterion)}</li>)}</ol><a className="inline-link" href={String(watch.baseline_url)} target="_blank" rel="noreferrer">Frozen baseline ↗</a><p>Status {String(watch.status)} · expires {new Date(Number(watch.expires_at) * 1000).toLocaleString()}</p></div>}
    {!prepared && <form className="form-stack" onSubmit={async (event) => {
      event.preventDefault(); if (!watch) return; setBusy(true); setError('');
      try { const response = await fetch('/api/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baselineUrl: watch.baseline_url, newUrl: later, passage }) }); const result = await response.json() as Preflight; if (result.baselineDigest && result.baselineDigest !== watch.baseline_digest) throw new Error('Preview baseline differs from the frozen on-chain digest.'); setPreflight(result); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Preflight failed.'); } finally { setBusy(false); }
    }}>
      <div className="field"><label htmlFor="later">Later Wayback id_ snapshot</label><input id="later" type="url" required value={later} onChange={(event) => { setLater(event.target.value); setPreflight(null); }} placeholder="https://web.archive.org/web/20230929213507id_/https://twitter.com/en/privacy" /></div>
      <div className="field"><label htmlFor="passage">Exact new passage · up to 1,200 characters</label><textarea id="passage" required maxLength={1200} value={passage} onChange={(event) => { setPassage(event.target.value); setPreflight(null); }} /></div>
      <button className="secondary-button" disabled={!watch || busy}>{busy ? 'Fetching exact snapshots…' : 'Run archive preflight'}</button>
      {preflight && <div role="status" className={preflight.ok ? 'notice success-notice' : 'notice'}><strong>{preflight.ok ? 'Preview checks pass' : 'Preview checks failed'}</strong><p>{preflight.error ?? 'The passage is present later and absent from the baseline.'}</p><p>{preflight.presentInNew ? '✓' : '×'} Present later · {preflight.absentFromBaseline ? '✓' : '×'} Absent from baseline</p><small>This is an off-chain preview. The contract fetches and checks the sources independently.</small></div>}
      <button type="button" className="primary-button" disabled={!preflight || busy || watch?.status !== 'OPEN'} onClick={async () => {
        if (!watch) return; setBusy(true); setError('');
        try { const nextId = id || newRecordId('c'); saveId(nextId); await submitAction({ key: `claim:prepare:${nextId}`, label: 'Verify claim archive evidence', contract: 'Claims', method: 'prepare_claim', args: [nextId, String(watch.id), later.trim(), passage], historicalReplay: replay, readback: { contract: 'Claims', method: 'get_claim', args: [nextId], until: { field: 'status', oneOf: ['READY', 'CODE_REJECTED', 'VOID'] } } }); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Claim preparation was not submitted.'); } finally { setBusy(false); }
      }}>{preflight?.ok ? 'Prepare claim evidence · 0 GEN' : 'Record the code check · 0 GEN'}</button>
      {preflight && !preflight.ok && <small className="quiet">A failed preview can be confirmed on-chain without posting a bond or invoking a model.</small>}
    </form>}
    <ActionStatus record={prepared} />
    {prepared?.stateVerified && <div className="notice"><strong>{String(record.status ?? 'Prepared evidence')}</strong><p>{String(record.reason ?? '')}</p><span className="mono">Claim {id}</span></div>}
    {prepared?.stateVerified && object(prepared.stateReadback).status === 'READY' && <PreparedBond id={id} kind="CLAIM" account={prepared.account} amountWei={String(watch?.bond_wei ?? '1')} deadline={Number(record.prepare_deadline)} judge={{ key: `claim:judge:${id}`, label: 'Judge the new policy passage', contract: 'Claims', method: 'judge_claim', args: [id], expectedAccount: prepared.account, historicalReplay: replay, readback: { contract: 'Claims', method: 'get_claim', args: [id], until: { field: 'status', oneOf: ['TRIGGERED', 'NOT_TRIGGERED', 'UNCLEAR', 'VOID'] } } }} />}
    {judgment?.stateVerified && Array.isArray(record.results) && <div className="criteria-list">{record.results.map((raw, index) => { const item = object(raw); return <div className="criteria-item" key={index}><div><strong>{Array.isArray(watch?.criteria) ? String(watch.criteria[index]) : `Frozen criterion ${index + 1}`}</strong><blockquote className="quote">{String(item.quote ?? '')}</blockquote><p>{String(item.reason ?? '')}</p></div><span className="tag">{String(item.verdict)}</span></div>; })}</div>}
    {record.status === 'TRIGGERED' && <SettlementControls claimId={id} deadline={Number(record.challenge_deadline)} historicalReplay={replay} />}
    {prepared?.stage?.startsWith('FINALIZED') && <button type="button" className="secondary-button" onClick={() => { saveId(''); setPreflight(null); }}>Prepare another claim</button>}
    {error && <p role="alert" className="notice wallet-error">{error}</p>}
  </section>;
}
