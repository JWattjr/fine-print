'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { useActionRecord } from '@/components/action-status';
import { readStudio } from '@/lib/studio-actions';
import { useClock } from '@/lib/form-storage';
import { explorerTransaction } from '@/lib/explorer';

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }

export function SettlementControls({ claimId, deadline, historicalReplay }: { claimId: string; deadline: number; historicalReplay: boolean }) {
  const clock = useClock();
  const seal = useActionRecord(`claim:seal:${claimId}`);
  const settle = useActionRecord(`claim:settle:${claimId}`);
  const [live, setLive] = useState<{ closure: Record<string, unknown>; settlement: Record<string, unknown> } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const closure = seal?.stateVerified ? object(seal.stateReadback) : live?.closure;
  const settlement = settle?.stateVerified ? object(settle.stateReadback) : live?.settlement;
  const windowClosed = clock / 1000 >= deadline;
  return <section className="form-stack">
    <h2 className="section-label">Challenge window & settlement</h2>
    <p className="notice">{windowClosed ? 'Challenge intake deadline has passed.' : 'Challenges remain open.'} Deadline: {new Date(deadline * 1000).toLocaleString()}. Native appeals and every pending challenge must resolve before payment.</p>
    {!windowClosed && <Link className="inline-link" href={`/challenges/${claimId}`}>Review or challenge this claim →</Link>}
    <button className="secondary-button" disabled={busy} type="button" onClick={async () => {
      setBusy(true); setError('');
      try { const closure = await readStudio({ contract: 'Challenges', method: 'get_claim_summary', args: [claimId] }); const settlement = await readStudio({ contract: 'Bounties', method: 'get_settlement', args: [claimId] }); setLive({ closure: object(closure.value), settlement: object(settlement.value) }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Settlement read is unavailable.'); } finally { setBusy(false); }
    }}>{busy ? 'Reading finalized state…' : 'Read current challenge and payout state'}</button>
    {live && windowClosed && !closure?.sealed && !settlement?.status && <ActionButton disabled={Number(closure?.pending ?? 0) !== 0 || closure?.status === 'PENDING_SEAL'} spec={{ key: `claim:seal:${claimId}`, label: 'Close challenge intake', contract: 'Challenges', method: 'seal_claim', args: [claimId], historicalReplay, readback: { contract: 'Challenges', method: 'get_claim_summary', args: [claimId], until: { field: 'sealed', equals: true } } }}>Seal resolved challenge window</ActionButton>}
    {closure && Number(closure.pending) > 0 && <p className="notice">{String(closure.pending)} challenge(s) remain pending. Resolve them or use their timeout refund path before closing intake.</p>}
    {closure?.status === 'PENDING_SEAL' && clock / 1000 >= Number(closure.resolve_deadline) && <ActionButton spec={{ key: `claim:resume-seal:${claimId}`, label: 'Resume delayed challenge closure callback', contract: 'Challenges', method: 'resume_seal', args: [claimId], recovery: true, historicalReplay, readback: { contract: 'Challenges', method: 'get_claim_summary', args: [claimId], until: { field: 'sealed', equals: true } } }}>Resume delayed challenge closure · 0 GEN</ActionButton>}
    {closure?.upheld === true && <p className="notice">An upheld challenge prevents this claim from receiving the bounty.</p>}
    {closure?.sealed === true && closure.upheld === false && (!settlement?.status || settle) && <ActionButton spec={{ key: `claim:settle:${claimId}`, label: 'Reserve finalized bounty and return hunter bond', contract: 'Bounties', method: 'settle', args: [claimId], historicalReplay, readback: { contract: 'Bounties', method: 'get_settlement', args: [claimId], until: { field: 'status', oneOf: ['AWAITING_PULL', 'PAID', 'EXPIRED'] } } }}>Reserve bounty payout</ActionButton>}
    {settlement?.status === 'AWAITING_PULL' && <p className="notice">Bounty credit is reserved for {String(settlement.recipient)}. <Link className="inline-link" href="/credits">Claim and verify the native payout →</Link></p>}
    {settlement?.status === 'PAID' && <p className="notice success-notice"><strong>Native bounty credit verified.</strong>{typeof settlement.child === 'string' && <a className="inline-link" href={explorerTransaction(settlement.child)} target="_blank" rel="noreferrer">Finalized native transfer ↗</a>}</p>}
    {error && <p role="alert" className="wallet-error">{error}</p>}
  </section>;
}
