'use client';
import { useState } from 'react';
import { readStudio, submitAction, needsRefresh, type ActionSpec } from '@/lib/studio-actions';
import { ActionStatus, useActionRecord, useActionRecords } from '@/components/action-status';
import { useClock } from '@/lib/form-storage';

async function checkFreshDeposit(spec: ActionSpec) {
  if (spec.contract !== 'Bounties' || spec.method !== 'deposit' || !spec.valueWei || BigInt(spec.valueWei) <= 0n) return;
  const ticketId = String(spec.args[1] ?? '');
  if (!ticketId || !spec.expectedAccount) throw new Error('Funding details are incomplete. Prepare a new ticket before opening the wallet.');
  const ticket = await readStudio({ contract: 'Bounties', method: 'get_ticket', args: [ticketId] });
  const t = ticket.value && typeof ticket.value === 'object' ? ticket.value as Record<string, unknown> : {};
  const now = Math.floor(Date.now() / 1000);
  if (t.finalized !== true || t.status !== 'READY' || String(t.amount_wei) !== spec.valueWei || String(t.owner).toLowerCase() !== spec.expectedAccount.toLowerCase()) {
    throw new Error('The funding ticket is no longer valid. Refresh the finalized state and prepare a replacement ticket.');
  }
  if (Number(t.expires_at) < now + 300) throw new Error('This ticket expires in less than five minutes. Prepare a fresh ticket before opening the wallet.');
  const source = t.kind === 'WATCH' ? 'Watches' : t.kind === 'CLAIM' ? 'Claims' : t.kind === 'CHALLENGE' ? 'Challenges' : null;
  const method = t.kind === 'WATCH' ? 'get_watch' : t.kind === 'CLAIM' ? 'get_claim' : 'get_challenge';
  if (!source || !t.record_id) throw new Error('The ticket has an unknown funding purpose. Prepare a replacement ticket.');
  const result = await readStudio({ contract: source, method, args: [String(t.record_id)] });
  const record = result.value && typeof result.value === 'object' ? result.value as Record<string, unknown> : {};
  const status = t.kind === 'WATCH' ? 'COMPILED' : 'READY';
  const deadline = Number(t.kind === 'WATCH' ? record.funding_deadline : record.prepare_deadline);
  if (record.finalized !== true || record.status !== status || !deadline || deadline < now + 300) {
    throw new Error('The funded record is no longer open for at least five minutes. Refresh its finalized state before preparing a new ticket.');
  }
}

export function ActionButton({ spec, children, disabled = false, primary = false, validUntil }: { spec: ActionSpec; children: React.ReactNode; disabled?: boolean; primary?: boolean; validUntil?: number }) {
  const record = useActionRecord(spec.key);
  const history = useActionRecords();
  const waiting = history.some((action) => !action.stage?.startsWith('FINALIZED')) || (!spec.recovery && history.some(needsRefresh));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clock = useClock();
  return <div className="action-step">
    {!record && <button className={primary ? 'primary-button' : 'secondary-button'} type="button" disabled={disabled || busy || waiting} onClick={async () => {
      setBusy(true); setError('');
      try { await checkFreshDeposit(spec); await submitAction(spec); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The wallet request could not be submitted.'); } finally { setBusy(false); }
    }}>{busy ? 'Waiting for wallet…' : children}</button>}
    {spec.valueWei && spec.valueWei !== '0' && !record && <p className="helper">Wallet value: {spec.valueWei} wei · StudioNet 61999{validUntil ? ` · ticket expires in ${Math.max(0, Math.floor(validUntil - clock / 1000))} seconds; sign promptly` : ''}</p>}
    <ActionStatus record={record} />
    {error && <p role="alert" className="wallet-error">{error}</p>}
  </div>;
}
