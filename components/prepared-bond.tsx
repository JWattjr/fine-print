'use client';
import Link from 'next/link';
import { ActionButton } from '@/components/action-button';
import { useActionRecord } from '@/components/action-status';
import { useClock, newRecordId, useStoredId } from '@/lib/form-storage';
import type { ActionSpec } from '@/lib/studio-actions';

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }

export function PreparedBond({ id, kind, account, amountWei, deadline, judge, nativeAllowed = true }: { id: string; kind: 'CLAIM' | 'CHALLENGE'; account: string; amountWei: string; deadline: number; judge: ActionSpec; nativeAllowed?: boolean }) {
  const [saved, save] = useStoredId(`fineprint:bond-ticket:${kind}:${id}`);
  const ticket = saved || `bt_${id}`;
  const prepared = useActionRecord(`ticket:${ticket}`);
  const expired = useActionRecord(`ticket:expire:${ticket}`);
  const deposited = useActionRecord(`deposit:${ticket}`);
  const judgment = useActionRecord(judge.key);
  const timedOut = useActionRecord(`${kind}:timeout:${id}`);
  const clock = useClock();
  const ticketState = object(prepared?.stateReadback);
  const deposit = object(deposited?.stateReadback);
  const ticketReady = prepared?.stateVerified && ticketState.status === 'READY' && Number(ticketState.expires_at) > clock / 1000;
  const available = clock / 1000 < deadline;
  const target = kind === 'CLAIM' ? 'Claims' : 'Challenges';
  return <div className="form-stack">
    <h2 className="section-label">Post the {kind === 'CLAIM' ? 'hunter' : 'challenge'} bond</h2>
    <p className="helper">Exact bond: {amountWei} wei. Prepared evidence expires {new Date(deadline * 1000).toLocaleString()}. A void or unclear judgment makes the bond refundable.</p>
    <ActionButton disabled={!available || !!timedOut} spec={{ key: `ticket:${ticket}`, label: 'Prepare bond funding', contract: 'Bounties', method: 'prepare_deposit', args: [ticket, kind, id], expectedAccount: account, historicalReplay: judge.historicalReplay, readback: { contract: 'Bounties', method: 'get_ticket', args: [ticket], until: { field: 'finalized', equals: true } } }}>Prepare bond ticket · 0 GEN</ActionButton>
    {prepared?.stateVerified && !ticketReady && !deposited && <>
      <ActionButton spec={{ key: `ticket:expire:${ticket}`, label: 'Release unused bond ticket', recovery: true, contract: 'Bounties', method: 'expire_ticket', args: [ticket], historicalReplay: judge.historicalReplay, readback: { contract: 'Bounties', method: 'get_ticket', args: [ticket], until: { field: 'status', equals: 'EXPIRED' } } }}>Release expired ticket</ActionButton>
      {expired?.stateVerified && available && <button className="secondary-button" type="button" onClick={() => save(newRecordId('bt'))}>Prepare a replacement ticket</button>}
    </>}
    <ActionButton disabled={!nativeAllowed || !ticketReady || !available || !!timedOut} validUntil={Number(ticketState.expires_at)} primary spec={{ key: `deposit:${ticket}`, label: 'Post exact bond', contract: 'Bounties', method: 'deposit', args: [`d_${ticket}`, ticket], expectedAccount: account, valueWei: amountWei, historicalReplay: judge.historicalReplay, readback: { contract: 'Bounties', method: 'get_deposit', args: [`d_${ticket}`], until: { field: 'finalized', equals: true } } }}>Post bond · {amountWei} wei</ActionButton>
    {deposited?.stateVerified && deposit.status === 'REFUNDABLE' && <p className="notice">The ticket did not match when the deposit arrived. <Link className="inline-link" href="/credits">Withdraw your refundable credit →</Link></p>}
    <ActionButton disabled={!deposited?.stateVerified || deposit.status !== 'ALLOCATED' || !available || !!timedOut} primary spec={judge}>{kind === 'CLAIM' ? 'Judge the frozen criteria' : 'Judge the challenge ground'} · 0 GEN</ActionButton>
    {!available && !judgment?.stateVerified && <>
      <p className="notice">The unresolved evidence deadline has passed. Void it and make any funded bond refundable.</p>
      <ActionButton spec={{ key: `${kind}:timeout:${id}`, label: 'Void timed-out evidence and refund bond', recovery: true, contract: target, method: kind === 'CLAIM' ? 'timeout_claim' : 'timeout_challenge', args: [id], historicalReplay: judge.historicalReplay, readback: { contract: target, method: kind === 'CLAIM' ? 'get_claim' : 'get_challenge', args: [id], until: { field: 'status', equals: kind === 'CLAIM' ? 'VOID' : 'RESOLVED' } } }}>Void timed-out {kind === 'CLAIM' ? 'claim' : 'challenge'}</ActionButton>
    </>}
  </div>;
}
