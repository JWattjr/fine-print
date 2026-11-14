'use client';
import Link from 'next/link';
import { useState } from 'react';
import { readStudio } from '@/lib/studio-actions';
import { contractsDeployed } from '@/lib/studio-contracts';
import { SettlementControls } from '@/components/settlement-controls';
import { explorerTransaction } from '@/lib/explorer';

type Row = Record<string, unknown>;
function object(value: unknown): Row { return value && typeof value === 'object' ? value as Row : {}; }
function highlight(text: string, passage: string) {
  const at = text.indexOf(passage);
  return at < 0 ? text : <>{text.slice(0, at)}<mark className="mark-change">{passage}</mark>{text.slice(at + passage.length)}</>;
}

export function LiveCase({ claimId }: { claimId: string }) {
  const [data, setData] = useState<{ claim: Row; watch: Row; closure: Row; settlement: Row; challenges: Row[]; at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="live-section form-stack">
    <div className="transaction-heading"><div><h2 className="section-label">Live finalized case</h2><p className="mono">Claim {claimId} · StudioNet 61999</p></div><button className="secondary-button" type="button" disabled={busy || !contractsDeployed()} onClick={async () => {
      setBusy(true); setError('');
      try {
        const loaded = await readStudio({ contract: 'Claims', method: 'get_claim', args: [claimId] });
        const claim = object(loaded.value);
        if (!claim.id) throw new Error('This claim is not present in finalized state.');
        const [watch, closure, settlement] = await Promise.all([
          readStudio({ contract: 'Watches', method: 'get_watch', args: [String(claim.watch_id)], focus: String(claim.passage) }),
          readStudio({ contract: 'Challenges', method: 'get_claim_summary', args: [claimId] }),
          readStudio({ contract: 'Bounties', method: 'get_settlement', args: [claimId] }),
        ]);
        const summary = object(closure.value);
        const keys = Array.isArray(summary.ids) ? summary.ids.slice(0, 10) : [];
        const challenges = await Promise.all(keys.map(async (key) => object((await readStudio({ contract: 'Challenges', method: 'get_challenge', args: [String(key)] })).value)));
        setData({ claim, watch: object(watch.value), closure: summary, settlement: object(settlement.value), challenges, at: settlement.readAt });
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Live case read failed.'); } finally { setBusy(false); }
    }}>{busy ? 'Reading pinned case state…' : 'Read this case from StudioNet'}</button></div>
    {data && <>
      <div className="case-meta"><span>{data.watch.historical_replay === true ? 'HISTORICAL REPLAY' : 'PRODUCTION WATCH'}</span><span>STATUS {String(data.claim.status)}</span><span>READ {new Date(data.at).toLocaleString()}</span></div>
      <h3>{String(data.watch.concern)}</h3>
      <ol className="criteria-list">{Array.isArray(data.watch.criteria) && data.watch.criteria.map((criterion, index) => {
        const result = Array.isArray(data.claim.results) ? object(data.claim.results[index]) : {};
        return <li className="criteria-item" key={index}><div><strong>{String(criterion)}</strong>{typeof result.quote === 'string' && <blockquote className="quote">{result.quote}</blockquote>}<p>{String(result.reason ?? '')}</p></div><span className="tag gray">{String(result.verdict ?? 'NOT RUN')}</span></li>;
      })}</ol>
      <div className="redline"><section className="redline-pane"><h3>Baseline · {String(data.watch.baseline_timestamp)}</h3><p>{String(data.watch.baseline_text_preview ?? '')}</p><a className="inline-link" href={String(data.watch.baseline_url)} target="_blank" rel="noreferrer">Full archived baseline ↗</a></section><section className="redline-pane"><h3>Later · {String(data.claim.snapshot_timestamp)}</h3><p>{highlight(String(data.claim.snapshot_text_preview ?? data.claim.passage), String(data.claim.passage))}</p><a className="inline-link" href={String(data.claim.snapshot_url)} target="_blank" rel="noreferrer">Full later snapshot ↗</a></section></div>
      <p className="helper">Bounded excerpts from finalized contract state. SHA-256 digests describe the full normalized documents: baseline {String(data.watch.baseline_digest)} · later {String(data.claim.snapshot_digest ?? 'not accepted')}.</p>
      <p className="notice">{String(data.claim.reason ?? '')}</p>
      <h3>Challenges</h3>
      {data.challenges.length ? data.challenges.map((challenge) => <div className="probe-card" key={String(challenge.id)}><strong>{String(challenge.ground)} · {String(challenge.ruling ?? challenge.status)}</strong><p>{String(challenge.reason ?? '')}</p><blockquote className="quote">{String(challenge.baseline_passage || challenge.argument || 'Document comparison')}</blockquote></div>) : <p className="quiet">No challenges were recorded in the returned finalized summary.</p>}
      {Array.isArray(data.closure.ids) && data.closure.ids.length > 10 && <Link className="inline-link" href={`/challenges/${claimId}`}>Inspect remaining challenges →</Link>}
      {typeof data.settlement.status === 'string' && <div className="notice"><strong>Payout: {data.settlement.status}</strong><p>{String(data.settlement.amount_wei)} wei · native credit verified: {String(data.settlement.credit_verified)}</p>{typeof data.settlement.child === 'string' && <a className="inline-link" href={explorerTransaction(data.settlement.child)} target="_blank" rel="noreferrer">Native transfer receipt ↗</a>}</div>}
      {data.claim.status === 'TRIGGERED' && <SettlementControls claimId={claimId} deadline={Number(data.claim.challenge_deadline)} historicalReplay={data.watch.historical_replay === true} />}
    </>}
    {error && <p role="status" className="wallet-error">{error}</p>}
  </section>;
}
