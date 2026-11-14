'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { useActionRecord, useActionRecords } from '@/components/action-status';
import { contractAddress, contractsDeployed } from '@/lib/studio-contracts';
import { readStudio } from '@/lib/studio-actions';
import { connectStudioWallet } from '@/lib/wallet';
import { newRecordId, useClock, useStoredId } from '@/lib/form-storage';
import { withStudioRequestBudget } from '@/lib/studio-budget';
import { explorerTransaction } from '@/lib/explorer';
import type { TxView } from '@/lib/transactions';
import { EscrowRecovery } from '@/components/escrow-recovery';

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
const hashPattern = /^0x[\da-fA-F]{64}$/;

async function transaction(hash: string): Promise<TxView> {
  if (!hashPattern.test(hash)) throw new Error('A full transaction hash is required.');
  const response = await withStudioRequestBudget(() => fetch(`/api/studio/transactions/${hash}`, { cache: 'no-store' }));
  const payload = await response.json() as { ok: boolean; transaction?: TxView; error?: string };
  if (!response.ok || !payload.ok || !payload.transaction) throw new Error(payload.error ?? 'Transaction read unavailable.');
  return payload.transaction;
}

function CreditCard({ initial, loadedAt }: { initial: Record<string, unknown>; loadedAt: string }) {
  const id = String(initial.id);
  const history = useActionRecords().filter((action) => action.contract === 'Bounties' && action.readback?.method === 'get_credit' && action.readback.args[0] === id);
  const candidates = [{ state: initial, at: loadedAt }, ...history.filter((action) => action.stateVerified).map((action) => ({ state: object(action.stateReadback), at: action.readAt ?? action.submittedAt }))];
  candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const credit = candidates[0].state;
  const attempt = Number(credit.attempt ?? 0);
  const pull = history.find((action) => action.method === 'claim' && action.args[1] === attempt);
  const [request, saveRequest] = useStoredId(`fineprint:credit-verify:${id}:${attempt}`);
  const verifyKey = `credit:verify:${id}:${attempt}:${request || 'first'}`;
  const verification = useActionRecord(verifyKey);
  const [customParent, setCustomParent] = useState('');
  const [childHash, setChildHash] = useState('');
  const parentHash = customParent || pull?.hash || String(credit.parent ?? '');
  const [inspection, setInspection] = useState<{ parent: TxView; child: TxView } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inspecting = useRef(false);
  const clock = useClock();

  const inspect = useCallback(async () => {
    if (inspecting.current) return;
    inspecting.current = true;
    setBusy(true); setError('');
    try {
      const parent = await transaction(parentHash);
      const selected = childHash || (parent.triggeredTransactions?.length === 1 ? parent.triggeredTransactions[0] : '');
      if (!selected) throw new Error('The linked native child is not indexed yet. Tracking will try again.');
      const child = await transaction(selected);
      if (parent.from?.toLowerCase() !== String(credit.owner).toLowerCase() || parent.to?.toLowerCase() !== contractAddress('Bounties')?.toLowerCase()) throw new Error('The parent is not this wallet’s escrow transaction.');
      if (!parent.triggeredTransactions?.some((hash) => hash.toLowerCase() === selected.toLowerCase()) || child.triggeredBy?.toLowerCase() !== parentHash.toLowerCase()) throw new Error('This native child is not linked to the selected parent.');
      if (child.to?.toLowerCase() !== String(credit.owner).toLowerCase() || child.from?.toLowerCase() !== contractAddress('Bounties')?.toLowerCase() || child.valueWei !== String(credit.amount_wei)) throw new Error('The child destination or exact wei amount does not match the credit.');
      setChildHash(selected); setInspection({ parent, child });
      if (child.status === 'FINALIZED') setTracking(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Native receipt lookup failed.'); }
    finally { inspecting.current = false; setBusy(false); }
  }, [parentHash, childHash, credit.owner, credit.amount_wei]);

  useEffect(() => {
    if (!tracking) return;
    const timer = window.setInterval(() => { void inspect(); }, 10000);
    return () => window.clearInterval(timer);
  }, [tracking, inspect]);

  const nativeFinal = inspection?.parent.stage === 'FINALIZED_SUCCESS' && inspection.child.status === 'FINALIZED' && typeof inspection.child.valueCredited === 'boolean';
  return <article className="credit-card form-stack">
    <div className="transaction-heading"><div><strong>{String(credit.purpose).replaceAll('_', ' ')}</strong><p className="mono">{id}</p></div><span className="tag gray">{String(credit.status).replaceAll('_', ' ')}</span></div>
    <p><strong>{String(credit.amount_wei)} wei</strong> · owner <span className="mono">{String(credit.owner)}</span></p>
    {credit.status === 'PENDING_FINALITY' && <><p className="helper">Allocation is waiting for its finalized callback. Refresh the credit list after finality.</p>{clock / 1000 >= Number(credit.created_at) + 1800 && <ActionButton spec={{ key: `credit:resume:${id}`, label: 'Resume delayed credit callback', contract: 'Bounties', method: 'resume_credit', recovery: true, args: [id], readback: { contract: 'Bounties', method: 'get_credit', args: [id], until: { field: 'status', equals: 'AVAILABLE' } } }}>Resume delayed allocation</ActionButton>}</>}
    {credit.status === 'AVAILABLE' && <ActionButton primary disabled={credit.purpose === 'BOUNTY' && clock / 1000 >= Number(credit.claim_deadline)} spec={{ key: `credit:pull:${id}:${attempt + 1}`, label: 'Claim allocated native credit', contract: 'Bounties', method: 'claim', args: [id, attempt + 1], expectedAccount: String(credit.owner), readback: { contract: 'Bounties', method: 'get_credit', args: [id], until: { field: 'attempt', equals: attempt + 1 }, also: [{ field: 'status', oneOf: ['TRANSFER_PENDING', 'VERIFYING', 'AVAILABLE', 'PAID'] }] } }}>Claim {String(credit.amount_wei)} wei · wallet sends 0 GEN</ActionButton>}
    {credit.status === 'AVAILABLE' && credit.purpose === 'BOUNTY' && clock / 1000 >= Number(credit.claim_deadline) && <ActionButton spec={{ key: `credit:expire:${id}`, label: 'Refund unclaimed bounty to sponsor', contract: 'Bounties', method: 'expire_unclaimed_bounty', recovery: true, args: [id], readback: { contract: 'Bounties', method: 'get_credit', args: [id], until: { field: 'status', equals: 'EXPIRED' } } }}>Return expired unclaimed bounty</ActionButton>}
    {credit.status === 'TRANSFER_PENDING' && <>
      <p className="notice">The native transfer is reserved. A second pull is blocked until its final credit outcome is proved.</p>
      <div className="field"><label htmlFor={`parent-${id}`}>Claim parent transaction</label><input id={`parent-${id}`} value={parentHash} onChange={(event) => { setCustomParent(event.target.value); setInspection(null); setTracking(false); }} placeholder="0x…" /></div>
      <div className="field"><label htmlFor={`child-${id}`}>Linked native child · discovered automatically</label><input id={`child-${id}`} value={childHash} onChange={(event) => { setChildHash(event.target.value); setInspection(null); setTracking(false); }} placeholder="0x…" /></div>
      <button type="button" className="secondary-button" disabled={busy || !hashPattern.test(parentHash)} onClick={() => { setTracking(true); void inspect(); }}>{busy ? 'Reading native receipts…' : tracking ? 'Tracking every 10 seconds…' : 'Find and track native transfer'}</button>
      {inspection && <div className="notice"><a className="inline-link" href={explorerTransaction(parentHash)} target="_blank" rel="noreferrer">Parent ↗</a> · <a className="inline-link" href={explorerTransaction(childHash)} target="_blank" rel="noreferrer">Native child ↗</a><p>Child status: {inspection.child.status} · exact amount: {inspection.child.valueWei} wei · native value credited: {String(inspection.child.valueCredited)}</p></div>}
      <ActionButton disabled={!nativeFinal} spec={{ key: verifyKey, label: 'Verify exact finalized native credit', contract: 'Bounties', method: 'verify_claim', args: [id, attempt, parentHash, childHash], readback: { contract: 'Bounties', method: 'get_credit', args: [id], until: { field: 'status', oneOf: ['PAID', 'AVAILABLE'] }, also: [{ field: 'attempt', equals: attempt }] } }}>{inspection?.child.valueCredited === false ? 'Prove failed transfer and restore credit' : 'Verify native credit'} · 0 GEN</ActionButton>
      {verification?.stage === 'FINALIZED_ERROR' && <button className="secondary-button" type="button" onClick={() => saveRequest(newRecordId('v'))}>Prepare a new receipt verification request</button>}
      {clock / 1000 >= Number(credit.transfer_deadline) && <p className="helper">The transfer resolution deadline has passed. Verification still requires its linked final receipt; an unknown outcome never permits a second payment.</p>}
    </>}
    {credit.status === 'VERIFYING' && <><p className="notice">The receipt proof is accepted. Waiting for its finalized callback.</p>{clock / 1000 >= Number(credit.transfer_deadline) && <ActionButton spec={{ key: `credit:resume-verification:${id}:${attempt}`, label: 'Resume finalized receipt callback', contract: 'Bounties', method: 'resume_verification', args: [id], recovery: true, readback: { contract: 'Bounties', method: 'get_credit', args: [id], until: { field: 'status', oneOf: ['PAID', 'AVAILABLE'] }, also: [{ field: 'attempt', equals: attempt }] } }}>Resume delayed receipt verification</ActionButton>}</>}
    {credit.status === 'PAID' && <p className="notice success-notice"><strong>Native credit verified.</strong>{typeof credit.child === 'string' && <a className="inline-link" href={explorerTransaction(credit.child)} target="_blank" rel="noreferrer">Finalized native transfer ↗</a>}</p>}
    {error && <p role="status" className="wallet-error">{error}</p>}
  </article>;
}

export function CreditsManager({ initialWallet }: { initialWallet: string }) {
  const [saved, saveWallet] = useStoredId('fineprint:credits-wallet');
  const [typed, setTyped] = useState<string | null>(null);
  const wallet = typed ?? (initialWallet || saved);
  const [credits, setCredits] = useState<Record<string, unknown>[]>([]);
  const [loadedAt, setLoadedAt] = useState('');
  const [loadedWallet, setLoadedWallet] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failedHash, setFailedHash] = useState('');

  async function load(address = wallet, page = offset) {
    setBusy(true); setError('');
    try {
      if (!/^0x[\da-fA-F]{40}$/.test(address)) throw new Error('Enter a full wallet address.');
      const result = await readStudio({ contract: 'Bounties', method: 'list_credits', args: [address, page, 25] });
      const value = object(result.value);
      setCredits(Array.isArray(value.credits) ? value.credits.map(object) : []); setLoadedAt(result.readAt); setLoadedWallet(address); setTotal(Number(value.total ?? 0)); setOffset(page); saveWallet(address);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Credit read failed.'); } finally { setBusy(false); }
  }

  return <div className="form-stack">
    {!contractsDeployed() && <p className="notice">Escrow deployment verification is pending.</p>}
    <div className="field"><label htmlFor="credit-wallet">Wallet address · public read</label><input id="credit-wallet" value={wallet} placeholder="0x…" onChange={(event) => { setTyped(event.target.value); setCredits([]); }} /></div>
    <div className="button-row"><button className="primary-button" disabled={busy || !contractsDeployed()} type="button" onClick={() => void load(wallet, 0)}>{busy ? 'Reading finalized credits…' : 'Read finalized credits'}</button><button className="secondary-button" type="button" onClick={async () => { setError(''); try { const connected = await connectStudioWallet(); setTyped(connected.account); saveWallet(connected.account); await load(connected.account, 0); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Wallet connection failed.'); } }}>Use my connected wallet</button></div>
    {loadedAt && <p className="helper">Live finalized StudioNet read for {loadedWallet} at {new Date(loadedAt).toLocaleString()}. Refresh to include new allocations.</p>}
    {loadedAt && credits.length === 0 && <p className="notice">No credits for this wallet on this page.</p>}
    {credits.map((credit) => <CreditCard key={String(credit.id)} initial={credit} loadedAt={loadedAt} />)}
    {total > 25 && <div className="button-row"><button className="secondary-button" disabled={offset === 0 || busy} type="button" onClick={() => void load(loadedWallet, Math.max(0, offset - 25))}>Previous credit page</button><button className="secondary-button" disabled={offset + 25 >= total || busy} type="button" onClick={() => void load(loadedWallet, offset + 25)}>Next credit page</button></div>}
    <section className="form-stack"><h2 className="section-label">Recover a failed payable deposit</h2><p className="helper">StudioNet can credit value even when execution fails. The original sender can prove the finalized failed transaction and recover that value once.</p><div className="field"><label htmlFor="failed-deposit">Finalized failed deposit transaction</label><input id="failed-deposit" value={failedHash} onChange={(event) => setFailedHash(event.target.value)} placeholder="0x…" /></div><ActionButton disabled={!hashPattern.test(failedHash) || !/^0x[\da-fA-F]{40}$/.test(wallet) || !contractsDeployed()} spec={{ key: `deposit:recover:${failedHash.toLowerCase()}`, label: 'Recover credited value from failed execution', contract: 'Bounties', method: 'recover_failed_deposit', recovery: true, args: [failedHash], expectedAccount: wallet, readback: { contract: 'Bounties', method: 'get_credit', args: [`failed-refund:${failedHash.toLowerCase()}`], until: { field: 'status', equals: 'AVAILABLE' } } }}>Prove failed credit and reserve refund · 0 GEN</ActionButton></section>
    <EscrowRecovery />
    {error && <p role="alert" className="notice wallet-error">{error}</p>}
  </div>;
}
