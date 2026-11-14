'use client';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { readStudio } from '@/lib/studio-actions';
import { contractsDeployed } from '@/lib/studio-contracts';
import { useClock } from '@/lib/form-storage';

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {};
const validId = (value: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(value);

export function EscrowRecovery() {
  const [id, setId] = useState('');
  const [kind, setKind] = useState<'deposit' | 'bond'>('deposit');
  const [hash, setHash] = useState('');
  const [record, setRecord] = useState<Row | null>(null);
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clock = useClock();
  const ready = !!record && (kind === 'deposit'
    ? record.status === 'PENDING_FINALITY' && clock / 1000 >= Number(record.resolve_deadline) && /^0x[\da-fA-F]{64}$/.test(hash)
    : record.status === 'FUNDED' && eligible);
  return <section className="form-stack action-step">
    <h2 className="section-label">Resume a delayed escrow callback</h2>
    <p className="helper">Read the finalized record first. A delayed deposit needs its successful parent receipt. Bond reconciliation uses the finalized claim or challenge ruling to finish its allocation.</p>
    <div className="field-row"><div className="field"><label htmlFor="recovery-kind">Record type</label><select id="recovery-kind" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setRecord(null); }}><option value="deposit">Deposit</option><option value="bond">Claim or challenge bond</option></select></div><div className="field"><label htmlFor="recovery-id">Record ID</label><input id="recovery-id" value={id} onChange={(event) => { setId(event.target.value); setRecord(null); }} /></div></div>
    <button className="secondary-button" disabled={busy || !validId(id) || !contractsDeployed()} type="button" onClick={async () => {
      setBusy(true); setError(''); setEligible(false); setRecord(null);
      try {
        const value = object((await readStudio({ contract: 'Bounties', method: kind === 'deposit' ? 'get_deposit' : 'get_bond', args: [id] })).value);
        if (!value.id) throw new Error('No finalized escrow record was found.');
        if (kind === 'bond') {
          const result = object((await readStudio({ contract: value.kind === 'CLAIM' ? 'Claims' : 'Challenges', method: value.kind === 'CLAIM' ? 'get_claim' : 'get_challenge', args: [id] })).value);
          setEligible(result.finalized === true && (value.kind === 'CLAIM' ? ['NOT_TRIGGERED', 'UNCLEAR', 'VOID'].includes(String(result.status)) : result.status === 'RESOLVED'));
        }
        setRecord(value);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Escrow read failed.'); } finally { setBusy(false); }
    }}>{busy ? 'Reading escrow and ruling…' : 'Inspect recovery record'}</button>
    {record && <>
      <p className="notice">Finalized record status: {String(record.status)} · {String(record.amount_wei)} wei. {kind === 'bond' && !eligible ? 'No refundable or allocatable finalized ruling is available.' : ''}{kind === 'deposit' && clock / 1000 < Number(record.resolve_deadline) ? 'The 30 minute recovery deadline has not passed.' : ''}</p>
      {kind === 'deposit' && <div className="field"><label htmlFor="recovery-parent">Successful deposit parent transaction</label><input id="recovery-parent" value={hash} onChange={(event) => setHash(event.target.value)} placeholder="0x…" /></div>}
      <ActionButton disabled={!ready} spec={{ key: `escrow:resume:${kind}:${id}`, label: kind === 'deposit' ? 'Resume finalized deposit allocation' : 'Reconcile finalized bond ruling', contract: 'Bounties', method: kind === 'deposit' ? 'resume_deposit' : 'reconcile_bond', recovery: true, args: kind === 'deposit' ? [id, hash] : [id], readback: { contract: 'Bounties', method: kind === 'deposit' ? 'get_deposit' : 'get_bond', args: [id], until: { field: 'status', oneOf: kind === 'deposit' ? ['ALLOCATED', 'REFUNDABLE'] : ['ALLOCATED', 'FORFEITED', 'AWARDED'] } } }}>Resume allocation · 0 GEN</ActionButton>
    </>}
    {error && <p role="status" className="wallet-error">{error}</p>}
  </section>;
}
