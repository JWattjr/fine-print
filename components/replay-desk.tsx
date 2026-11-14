'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { useActionRecord } from '@/components/action-status';
import { PreparedBond } from '@/components/prepared-bond';
import { SettlementControls } from '@/components/settlement-controls';
import { readStudio } from '@/lib/studio-actions';
import { CONTRACT_NAMES, contractsDeployed } from '@/lib/studio-contracts';
import { newRecordId, useClock, useStoredId } from '@/lib/form-storage';
import { replayIds, type ReplayPlan } from '@/lib/replay-plan';

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {};

function ReplayCase({ plan, configured, nativeAllowed }: { plan: ReplayPlan; configured: boolean; nativeAllowed: boolean }) {
  const ids = replayIds(plan.id);
  const [savedTicket, saveTicket] = useStoredId(`fineprint:replay-ticket:${plan.id}`);
  const ticket = savedTicket || ids.ticket;
  const compilation = useActionRecord(`replay:${plan.id}:compile`);
  const preparedTicket = useActionRecord(`ticket:${ticket}`);
  const expiredTicket = useActionRecord(`ticket:expire:${ticket}`);
  const funding = useActionRecord(`deposit:${ticket}`);
  const preparation = useActionRecord(`replay:${plan.id}:prepare`);
  const judgment = useActionRecord(`replay:${plan.id}:judge`);
  const challengePreparation = useActionRecord(`replay:${plan.id}:challenge-prepare`);
  const challengeJudgment = useActionRecord(`replay:${plan.id}:challenge-judge`);
  const [watch, setWatch] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recorded, setRecorded] = useState('');
  const clock = useClock();
  const compiled = object(compilation?.stateReadback);
  const claim = object(judgment?.stateReadback ?? preparation?.stateReadback);
  const challenge = object(challengeJudgment?.stateReadback ?? challengePreparation?.stateReadback);
  const ticketState = object(preparedTicket?.stateReadback);
  const deposit = object(funding?.stateReadback);
  const ticketReady = preparedTicket?.stateVerified && ticketState.status === 'READY' && Number(ticketState.expires_at) > clock / 1000;
  const fundingOpen = Number(compiled.funding_deadline) > clock / 1000;
  return <article className="credit-card form-stack" id={plan.id}>
    <div className="transaction-heading"><h2 className="section-label">{plan.id.replaceAll('-', ' ')}</h2><span className="tag red">Historical replay</span></div>
    <p><strong>{plan.concern}</strong></p>
    <p className="helper">Planned test: {plan.targetOutcome}. This is a hypothesis; only the actual finalized result counts.</p>
    <p className="mono">Watch {ids.watch} · claim {ids.claim}<br/>As-of {plan.baseline.timestamp} · bounty {plan.bountyWei} wei · hunter bond 1 wei · challenge bond 1 wei</p>
    <details><summary>Review immutable source inputs</summary><p><a className="inline-link" href={plan.baseline.url} target="_blank" rel="noreferrer">Baseline capture ↗</a>{plan.later && <> · <a className="inline-link" href={plan.later.url} target="_blank" rel="noreferrer">Later capture ↗</a></>}</p>{plan.passage && <blockquote className="quote">{plan.passage}</blockquote>}{plan.offlinePreflight && <p>Offline preview: later presence {String(plan.offlinePreflight.laterPresence)} · baseline absence {String(plan.offlinePreflight.baselineAbsence)}. The contract repeats these checks.</p>}{plan.challenge && <><p>Challenge ground: {plan.challenge.ground}</p>{plan.challenge.baselinePassage && <blockquote className="quote">{plan.challenge.baselinePassage}</blockquote>}<p>{plan.challenge.argument}</p></>}</details>
    <ActionButton disabled={!configured} spec={{ key: `replay:${plan.id}:compile`, label: `Compile historical concern · ${plan.id}`, contract: 'Watches', method: 'compile_watch', historicalReplay: true, args: [ids.watch, plan.baseline.original, plan.concern, { integer: plan.bountyWei }, 7200, plan.challengeSeconds ?? 1800, plan.baseline.timestamp], readback: { contract: 'Watches', method: 'get_watch', args: [ids.watch], until: { field: 'finalized', equals: true } } }}>Compile this historical concern · 0 GEN</ActionButton>
    {compilation?.stateVerified && <div className="notice"><strong>Actual compilation: {String(compiled.status)}</strong><p>{String(compiled.reason ?? '')}</p><ol>{Array.isArray(compiled.criteria) && compiled.criteria.map((criterion, index) => <li key={index}>{String(criterion)}</li>)}</ol><p className="mono">Criteria SHA-256 {String(compiled.criteria_hash ?? '')}<br/>Baseline SHA-256 {String(compiled.baseline_digest ?? '')}</p></div>}
    {compilation?.stateVerified && compiled.status === 'COMPILED' && <>
      <ActionButton disabled={!fundingOpen} spec={{ key: `ticket:${ticket}`, label: `Prepare replay watch funding · ${plan.id}`, contract: 'Bounties', method: 'prepare_deposit', historicalReplay: true, args: [ticket, 'WATCH', ids.watch], expectedAccount: compilation.account, readback: { contract: 'Bounties', method: 'get_ticket', args: [ticket], until: { field: 'finalized', equals: true } } }}>Prepare {plan.bountyWei}-wei watch ticket · 0 GEN</ActionButton>
      {preparedTicket?.stateVerified && !ticketReady && !funding && <><ActionButton spec={{ key: `ticket:expire:${ticket}`, label: 'Release expired replay ticket', contract: 'Bounties', method: 'expire_ticket', args: [ticket], recovery: true, historicalReplay: true, readback: { contract: 'Bounties', method: 'get_ticket', args: [ticket], until: { field: 'status', equals: 'EXPIRED' } } }}>Release expired unused ticket</ActionButton>{expiredTicket?.stateVerified && fundingOpen && <button className="secondary-button" type="button" onClick={() => saveTicket(newRecordId('rt'))}>Prepare replacement ticket</button>}</>}
      <ActionButton disabled={!nativeAllowed || !ticketReady || !fundingOpen} validUntil={Number(ticketState.expires_at)} spec={{ key: `deposit:${ticket}`, label: `Fund historical replay · ${plan.id}`, contract: 'Bounties', method: 'deposit', historicalReplay: true, args: [`d_${ticket}`, ticket], valueWei: plan.bountyWei, expectedAccount: compilation.account, readback: { contract: 'Bounties', method: 'get_deposit', args: [`d_${ticket}`], until: { field: 'finalized', equals: true } } }}>Fund replay watch · {plan.bountyWei} wei</ActionButton>
      {!nativeAllowed && <p className="notice">Native deposits remain locked pending owner approval. Review the actual compiled criteria before the first deposit.</p>}
    </>}
    {funding?.stateVerified && deposit.status === 'REFUNDABLE' && <p className="notice">Deposit is refundable. <Link className="inline-link" href="/credits">Open credits →</Link></p>}
    {funding?.stateVerified && deposit.status === 'ALLOCATED' && <button className="secondary-button" type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { setWatch(object((await readStudio({ contract: 'Watches', method: 'get_watch', args: [ids.watch], focus: plan.passage })).value)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Funded watch read failed.'); } finally { setBusy(false); } }}>{busy ? 'Reading watch finality…' : 'Read finalized funded watch'}</button>}
    {watch && <p className="notice">Live watch status: {String(watch.status)} · expires {new Date(Number(watch.expires_at) * 1000).toLocaleString()}</p>}
    {watch?.status === 'OPEN' && plan.later && plan.passage && <ActionButton spec={{ key: `replay:${plan.id}:prepare`, label: `Check archived passage · ${plan.id}`, contract: 'Claims', method: 'prepare_claim', historicalReplay: true, args: [ids.claim, ids.watch, plan.later.url, plan.passage], readback: { contract: 'Claims', method: 'get_claim', args: [ids.claim], until: { field: 'status', oneOf: ['READY', 'CODE_REJECTED', 'VOID'] } } }}>Record this exact passage check · 0 GEN</ActionButton>}
    {preparation?.stateVerified && <p className="notice">Actual claim state: <strong>{String(claim.status)}</strong> · {String(claim.reason ?? '')}</p>}
    {preparation?.stateVerified && object(preparation.stateReadback).status === 'READY' && <PreparedBond id={ids.claim} kind="CLAIM" account={preparation.account} amountWei={String(compiled.bond_wei ?? '1')} deadline={Number(claim.prepare_deadline)} nativeAllowed={nativeAllowed} judge={{ key: `replay:${plan.id}:judge`, label: `Judge archived passage · ${plan.id}`, contract: 'Claims', method: 'judge_claim', args: [ids.claim], expectedAccount: preparation.account, historicalReplay: true, readback: { contract: 'Claims', method: 'get_claim', args: [ids.claim], until: { field: 'status', oneOf: ['TRIGGERED', 'NOT_TRIGGERED', 'UNCLEAR', 'VOID'] } } }} />}
    {judgment?.stateVerified && <div className="notice"><strong>Actual judgment: {String(claim.status)}</strong>{Array.isArray(claim.results) && claim.results.map((raw, index) => { const row = object(raw); return <p key={index}>{String(row.verdict)} · “{String(row.quote ?? '')}”</p>; })}</div>}
    {judgment?.stateVerified && claim.status === 'TRIGGERED' && plan.challenge && <>
      <ActionButton disabled={clock / 1000 >= Number(claim.challenge_deadline)} spec={{ key: `replay:${plan.id}:challenge-prepare`, label: `Prepare archive challenge · ${plan.id}`, contract: 'Challenges', method: 'prepare_challenge', historicalReplay: true, args: [ids.challenge, ids.claim, plan.challenge.ground, plan.challenge.baselinePassage, plan.challenge.argument], readback: { contract: 'Challenges', method: 'get_challenge', args: [ids.challenge], until: { field: 'status', oneOf: ['READY', 'CODE_REJECTED', 'VOID'] } } }}>Prepare the planned archive challenge · 0 GEN</ActionButton>
      {challengePreparation?.stateVerified && object(challengePreparation.stateReadback).status === 'READY' && <PreparedBond id={ids.challenge} kind="CHALLENGE" account={challengePreparation.account} amountWei={String(compiled.challenge_bond_wei ?? '1')} deadline={Number(challenge.prepare_deadline)} nativeAllowed={nativeAllowed} judge={{ key: `replay:${plan.id}:challenge-judge`, label: `Judge archive challenge · ${plan.id}`, contract: 'Challenges', method: 'judge_challenge', historicalReplay: true, args: [ids.challenge], expectedAccount: challengePreparation.account, readback: { contract: 'Challenges', method: 'get_challenge', args: [ids.challenge], until: { field: 'status', equals: 'RESOLVED' } } }} />}
      {challengeJudgment?.stateVerified && <p className="notice">Actual challenge ruling: <strong>{String(challenge.ruling)}</strong> · {String(challenge.reason ?? '')}</p>}
    </>}
    {judgment?.stateVerified && claim.status === 'TRIGGERED' && <SettlementControls claimId={ids.claim} deadline={Number(claim.challenge_deadline)} historicalReplay />}
    {preparation?.hash && <Link className="inline-link" href={`/case/chain-${ids.claim}`}>Read the finalized public case →</Link>}
    {(compilation?.stateVerified || judgment?.stateVerified || preparation?.stateVerified) && <button className="secondary-button" type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const response = await fetch('/api/internal/case-proof', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseId: plan.id }) }); const result = await response.json() as { ok?: boolean; verdict?: string; challengeRuling?: string; nativeCreditVerified?: boolean; error?: string }; if (!response.ok || !result.ok) throw new Error(result.error ?? 'Actual proof recording failed.'); setRecorded(`${result.verdict}${result.challengeRuling ? ` · challenge ${result.challengeRuling}` : ''} · native credit verified: ${String(result.nativeCreditVerified)}`); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Actual proof recording failed.'); } finally { setBusy(false); } }}>Read and record actual case proof</button>}
    {recorded && <p className="notice">Recorded actual outcome: {recorded} · <Link className="inline-link" href={`/case/${plan.id}`}>Open recorded case →</Link></p>}
    {error && <p role="alert" className="wallet-error">{error}</p>}
  </article>;
}

export function ReplayDesk({ plans, nativeAllowed }: { plans: ReplayPlan[]; nativeAllowed: boolean }) {
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="form-stack">
    <p className="notice">One-time historical replays. Every action has a fixed ID and saved hash. Failed transactions stay visible; this desk does not rerun a known action. Native deposits: {nativeAllowed ? 'owner approval recorded' : 'locked pending owner approval'}.</p>
    <button className="secondary-button" disabled={busy || !contractsDeployed()} type="button" onClick={async () => { setBusy(true); setError(''); try { for (const name of CONTRACT_NAMES) { const config = object((await readStudio({ contract: name, method: 'get_config', args: [] })).value); if (config.configured !== true) throw new Error(`${name} peer configuration is not finalized.`); } setConfigured(true); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Configuration check failed.'); } finally { setBusy(false); } }}>{busy ? 'Checking finalized peers…' : 'Verify finalized configuration'}</button>
    {configured && <p className="state-ok">All five contracts have finalized peer configuration.</p>}
    {error && <p role="status" className="wallet-error">{error}</p>}
    {plans.map((plan) => <ReplayCase key={plan.id} plan={plan} configured={configured} nativeAllowed={nativeAllowed} />)}
  </div>;
}
