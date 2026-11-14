'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { ActionStatus, useActionRecord } from '@/components/action-status';
import { PreparedBond } from '@/components/prepared-bond';
import { contractsDeployed } from '@/lib/studio-contracts';
import { newRecordId, useClock, useStoredId } from '@/lib/form-storage';
import { readStudio, submitAction } from '@/lib/studio-actions';

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }

export function ChallengeForm({ initialClaim }: { initialClaim: string }) {
  const [claimId, setClaimId] = useState(initialClaim);
  const [id, saveId] = useStoredId('fineprint:challenge-draft:' + claimId);
  const prepared = useActionRecord('challenge:prepare:' + id);
  const judgment = useActionRecord('challenge:judge:' + id);
  const timeout = useActionRecord('CHALLENGE:timeout:' + id);
  const [claim, setClaim] = useState<Record<string, unknown> | null>(null);
  const [watch, setWatch] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [inspected, setInspected] = useState<Record<string, unknown> | null>(null);
  const [ground, setGround] = useState('ALREADY_EXISTED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clock = useClock();
  const record = object(timeout?.stateVerified ? timeout.stateReadback : judgment?.stateVerified ? judgment.stateReadback : prepared?.stateReadback);
  const replay = watch?.historical_replay === true || prepared?.historicalReplay === true;
  const canPrepare = claim?.status === 'TRIGGERED' && claim.finalized === true && !claim.voided && Number(claim.challenge_deadline) > clock / 1000 && !summary?.sealed;

  async function load() {
    setBusy(true); setError('');
    try {
      const [result, closure] = await Promise.all([readStudio({ contract: 'Claims', method: 'get_claim', args: [claimId] }), readStudio({ contract: 'Challenges', method: 'get_claim_summary', args: [claimId] })]);
      const value = object(result.value);
      if (!value.id || value.finalized !== true) throw new Error('A finalized claim is required.');
      const parent = await readStudio({ contract: 'Watches', method: 'get_watch', args: [String(value.watch_id)] });
      setClaim(value); setWatch(object(parent.value)); setSummary(object(closure.value));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Claim read failed.'); } finally { setBusy(false); }
  }

  return <section className="form-stack">
    {replay && <span className="tag red">Historical replay · past policy captures</span>}
    <div className="field"><label htmlFor="claim-id">Claim ID</label><input id="claim-id" value={claimId} readOnly={!!prepared} onChange={(event) => { setClaimId(event.target.value); setClaim(null); setWatch(null); setSummary(null); }} placeholder="c_…" /></div>
    <button type="button" className="secondary-button" disabled={!claimId || busy || !contractsDeployed()} onClick={load}>{busy ? 'Reading finalized claim…' : 'Load claim and challenge window'}</button>
    {claim && <div className="notice"><strong>{String(watch?.concern ?? 'Frozen concern')}</strong><p>Claim status: {String(claim.status)} · challenge deadline {new Date(Number(claim.challenge_deadline) * 1000).toLocaleString()}</p><blockquote className="quote">{String(claim.passage)}</blockquote><a className="inline-link" href={String(watch?.baseline_url)} target="_blank" rel="noreferrer">Baseline snapshot ↗</a> · <a className="inline-link" href={String(claim.snapshot_url)} target="_blank" rel="noreferrer">Claim snapshot ↗</a></div>}
    {claim && !canPrepare && !prepared && <p className="notice">This claim is not accepting a new challenge. You can inspect its recorded challenges and finalized ruling.</p>}
    {!prepared && <form className="form-stack" onSubmit={async (event) => {
      event.preventDefault(); if (!claim || !canPrepare) return; setBusy(true); setError('');
      try {
        const form = new FormData(event.currentTarget);
        const next = id || newRecordId('ch'); saveId(next);
        await submitAction({ key: 'challenge:prepare:' + next, label: 'Verify challenge archive evidence', contract: 'Challenges', method: 'prepare_challenge',
          args: [next, claimId, ground, ground === 'ALREADY_EXISTED' ? String(form.get('baseline')) : '', String(form.get('argument') ?? '')], historicalReplay: replay,
          readback: { contract: 'Challenges', method: 'get_challenge', args: [next], until: { field: 'status', oneOf: ['READY', 'CODE_REJECTED', 'VOID'] } } });
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Challenge preparation was not submitted.'); } finally { setBusy(false); }
    }}>
      <div className="field"><label htmlFor="ground">One challenge ground</label><select id="ground" value={ground} onChange={(event) => setGround(event.target.value)}><option value="ALREADY_EXISTED">The baseline already granted this substance</option><option value="WRONG_DOCUMENT">The later snapshot is a different document or locale</option></select></div>
      {ground === 'ALREADY_EXISTED' ? <div className="field"><label htmlFor="baseline-passage">Exact baseline passage</label><textarea id="baseline-passage" name="baseline" required maxLength={1200} placeholder="Paste up to 1,200 characters from the frozen baseline." /></div> : <p className="helper">The contract uses the claim’s pinned pair of snapshots. Validators compare bounded extracts of both documents.</p>}
      <div className="field"><label htmlFor="argument">Short explanation · optional</label><textarea id="argument" name="argument" maxLength={1200} placeholder="Explain the prior substance or document mismatch. This is context, not instructions to the judge." /></div>
      <button className="primary-button" disabled={!canPrepare || busy}>{busy ? 'Waiting for wallet…' : 'Prepare challenge evidence · 0 GEN'}</button>
    </form>}
    <ActionStatus record={prepared} />
    {prepared?.stateVerified && <div className="notice"><strong>{String(record.status)}</strong><p>{String(record.reason ?? '')}</p><span className="mono">Challenge {id}</span></div>}
    {prepared?.stateVerified && object(prepared.stateReadback).status === 'READY' && <PreparedBond id={id} kind="CHALLENGE" account={prepared.account} amountWei={String(watch?.challenge_bond_wei ?? '1')} deadline={Number(record.prepare_deadline)} judge={{ key: 'challenge:judge:' + id, label: 'Judge the challenge ground', contract: 'Challenges', method: 'judge_challenge', args: [id], expectedAccount: prepared.account, historicalReplay: replay, readback: { contract: 'Challenges', method: 'get_challenge', args: [id], until: { field: 'status', equals: 'RESOLVED' } } }} />}
    {typeof record.ruling === 'string' && <div className="notice"><strong>Finalized ruling: {record.ruling}</strong><p>{String(record.reason ?? '')}</p><Link className="inline-link" href="/credits">Read allocated bond credits →</Link></div>}
    {summary && Array.isArray(summary.ids) && summary.ids.length > 0 && <div className="form-stack"><h2 className="section-label">Recorded challenges</h2>{summary.ids.map((key) => <button key={String(key)} type="button" className="secondary-button" onClick={async () => { setError(''); try { const result = await readStudio({ contract: 'Challenges', method: 'get_challenge', args: [String(key)] }); setInspected(object(result.value)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Challenge read failed.'); } }}>Read {String(key)}</button>)}</div>}
    {inspected && <div className="notice"><strong>{String(inspected.id)} · {String(inspected.ruling ?? inspected.status)}</strong><p>{String(inspected.reason ?? '')}</p><p>Ground: {String(inspected.ground)} · challenger {String(inspected.challenger)}</p>{Array.isArray(inspected.decision) ? null : <details><summary>Inspect decision evidence</summary><pre>{JSON.stringify(inspected.decision, null, 2)}</pre></details>}{['READY', 'PENDING_PREPARATION', 'PENDING_JUDGMENT'].includes(String(inspected.status)) && clock / 1000 >= Number(inspected.prepare_deadline) && <ActionButton spec={{ key: 'CHALLENGE:timeout:' + String(inspected.id), label: 'Void timed-out challenge and refund its bond', recovery: true, contract: 'Challenges', method: 'timeout_challenge', args: [String(inspected.id)], historicalReplay: replay, readback: { contract: 'Challenges', method: 'get_challenge', args: [String(inspected.id)], until: { field: 'status', equals: 'RESOLVED' } } }}>Void timed-out challenge</ActionButton>}</div>}
    {prepared?.stage?.startsWith('FINALIZED') && <button type="button" className="secondary-button" onClick={() => saveId('')}>Prepare another challenge</button>}
    {error && <p className="notice wallet-error" role="alert">{error}</p>}
  </section>;
}
