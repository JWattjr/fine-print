'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { ActionStatus, useActionRecord } from '@/components/action-status';
import { contractsDeployed } from '@/lib/studio-contracts';
import { submitAction, readStudio } from '@/lib/studio-actions';
import { newRecordId, useStoredId } from '@/lib/form-storage';

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }

export function WatchForm() {
  const [id, saveId] = useStoredId('fineprint:watch-draft');
  const [savedTicket, saveTicket] = useStoredId('fineprint:watch-ticket:' + id);
  const ticket = savedTicket || 't_' + id;
  const compilation = useActionRecord('watch:compile:' + id);
  const preparation = useActionRecord('ticket:' + ticket);
  const expiration = useActionRecord('ticket:expire:' + ticket);
  const funding = useActionRecord('deposit:' + ticket);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState<Record<string, unknown> | null>(null);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 10000); return () => window.clearInterval(timer); }, []);
  const watch = object(compilation?.stateReadback);
  const ticketState = object(preparation?.stateReadback);
  const depositState = object(funding?.stateReadback);
  const compiled = compilation?.stateVerified && ['COMPILED', 'OPEN'].includes(String(watch.status));
  const ticketReady = preparation?.stateVerified && ticketState.status === 'READY' && Number(ticketState.expires_at) > clock / 1000;

  async function compile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const form = new FormData(event.currentTarget);
      const bounty = String(form.get('bounty') ?? '');
      if (!/^\d+$/.test(bounty) || BigInt(bounty) <= 0n || BigInt(bounty) > 100000000000000000n) throw new Error('Choose a positive bounty up to 0.1 GEN, expressed exactly in wei.');
      const days = Number(form.get('days'));
      const minutes = Number(form.get('challenge'));
      if (!Number.isInteger(days) || days < 1 || days > 90 || !Number.isFinite(minutes) || minutes < 0.5 || minutes * 60 >= days * 43200) throw new Error('Choose 1–90 days and a challenge window shorter than half the watch duration.');
      const nextId = id || newRecordId('w');
      saveId(nextId);
      await submitAction({ key: 'watch:compile:' + nextId, label: 'Compile policy concern', contract: 'Watches', method: 'compile_watch',
        args: [nextId, String(form.get('url')).trim(), String(form.get('concern')).trim(), { integer: bounty }, days * 86400, Math.round(minutes * 60), ''],
        readback: { contract: 'Watches', method: 'get_watch', args: [nextId], until: { field: 'finalized', equals: true } } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The compilation request was not submitted.'); }
    finally { setBusy(false); }
  }

  return <section className="form-stack">
    {!contractsDeployed() && <p className="notice">The contracts are being prepared. Wallet actions open after deployment verification.</p>}
    {!compilation && <form className="form-stack" onSubmit={compile}>
      <div className="field"><label htmlFor="policy">Official policy URL</label><input id="policy" name="url" type="url" placeholder="https://explore.zoom.us/en/terms/" required /><small>Use the canonical HTTPS policy URL of a supported service. The baseline comes from Wayback.</small></div>
      <div className="field"><label htmlFor="concern">What change should hunters watch for?</label><textarea id="concern" name="concern" minLength={10} maxLength={1200} placeholder="Tell me if the policy starts permitting use of customer content to train AI models." required /></div>
      <div className="field-row"><div className="field"><label htmlFor="bounty">Bounty · wei</label><input id="bounty" name="bounty" inputMode="numeric" pattern="[0-9]+" defaultValue="10" required /></div><div className="field"><label htmlFor="days">Watch duration · days</label><input id="days" name="days" type="number" min={1} max={90} defaultValue={7} required /></div></div>
      <div className="field"><label htmlFor="challenge">Challenge window · minutes</label><input id="challenge" name="challenge" type="number" min={0.5} max={1440} step={0.5} defaultValue={10} required /><small>The window starts after a triggered claim finalizes, in addition to the native appeal process.</small></div>
      <button className="primary-button" disabled={!contractsDeployed() || busy}>{busy ? 'Waiting for wallet…' : 'Compile concern · 0 GEN'}</button>
    </form>}
    <ActionStatus record={compilation} />
    {compilation?.stage === 'FINALIZED_SUCCESS' && ['COMPILED', 'PENDING_FINALITY'].includes(String(watch.status)) && clock / 1000 >= Number(watch.funding_deadline) && !funding && <ActionButton spec={{ key: `watch:expire:${id}`, label: 'Void expired unfunded watch', contract: 'Watches', method: 'expire_unfunded', args: [id], recovery: true, readback: { contract: 'Watches', method: 'get_watch', args: [id], until: { field: 'status', equals: 'VOID' } } }}>Void expired unfunded watch · 0 GEN</ActionButton>}
    {compilation?.stateVerified && <div className="notice"><strong>{watch.status === 'REJECTED' ? 'Concern rejected' : watch.status === 'VOID' ? 'Compilation voided' : 'Frozen watch'}</strong><p>{String(watch.reason ?? '')}</p>{Array.isArray(watch.criteria) && <ol>{watch.criteria.map((criterion, index) => <li key={index}>{String(criterion)}</li>)}</ol>}{typeof watch.baseline_url === 'string' && <a className="inline-link" href={watch.baseline_url} target="_blank" rel="noreferrer">Frozen Wayback baseline ↗</a>}<p className="mono">Watch {id}<br />Criteria SHA-256 {String(watch.criteria_hash ?? '')}<br />Expires {watch.expires_at ? new Date(Number(watch.expires_at) * 1000).toLocaleString() : '—'}</p></div>}
    {compiled && compilation && <>
      <h2 className="section-label">Fund the compiled watch</h2>
      <p className="helper">Review the frozen criteria and baseline before funding {String(watch.bounty_wei)} wei. The sponsor wallet is {compilation.account}.</p>
      <ActionButton spec={{ key: 'ticket:' + ticket, label: 'Prepare watch funding', contract: 'Bounties', method: 'prepare_deposit', args: [ticket, 'WATCH', id], expectedAccount: compilation.account, readback: { contract: 'Bounties', method: 'get_ticket', args: [ticket], until: { field: 'finalized', equals: true } } }}>Prepare funding ticket · 0 GEN</ActionButton>
      {preparation?.stateVerified && !ticketReady && !funding && <>
        <p className="notice">The unused funding ticket has expired. Release it before preparing a replacement.</p>
        <ActionButton spec={{ key: 'ticket:expire:' + ticket, label: 'Release expired funding ticket', recovery: true, contract: 'Bounties', method: 'expire_ticket', args: [ticket], readback: { contract: 'Bounties', method: 'get_ticket', args: [ticket], until: { field: 'status', equals: 'EXPIRED' } } }}>Release expired ticket</ActionButton>
        {expiration?.stateVerified && <button className="secondary-button" type="button" onClick={() => saveTicket(newRecordId('t'))}>Prepare a new ticket</button>}
      </>}
      <ActionButton disabled={!ticketReady} validUntil={Number(ticketState.expires_at)} primary spec={{ key: 'deposit:' + ticket, label: 'Fund policy watch', contract: 'Bounties', method: 'deposit', args: ['d_' + ticket, ticket], valueWei: String(watch.bounty_wei), expectedAccount: compilation.account, readback: { contract: 'Bounties', method: 'get_deposit', args: ['d_' + ticket], until: { field: 'finalized', equals: true } } }}>Fund watch · {String(watch.bounty_wei)} wei</ActionButton>
      {funding?.stateVerified && <div className="notice"><strong>{depositState.status === 'REFUNDABLE' ? 'Deposit is refundable' : 'Deposit finalized'}</strong><p>{depositState.status === 'REFUNDABLE' ? 'The ticket did not match when the deposit arrived. Open your credits to withdraw it.' : 'The finalized funding callback publishes the watch on the live docket.'}</p><Link className="inline-link" href={depositState.status === 'REFUNDABLE' ? '/credits' : '/watches'}>{depositState.status === 'REFUNDABLE' ? 'Open refundable credits →' : 'Open watch docket →'}</Link></div>}
      {funding?.stateVerified && <button className="secondary-button" type="button" onClick={async () => { setError(''); try { const result = await readStudio({ contract: 'Watches', method: 'get_watch', args: [id] }); setLive(object(result.value)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Live watch read failed.'); } }}>Read finalized watch status</button>}
      {live && <p role="status" className="notice">Live StudioNet status: <strong>{String(live.status)}</strong> · expires {new Date(Number(live.expires_at) * 1000).toLocaleString()}</p>}
    </>}
    {compilation?.stage?.startsWith('FINALIZED') && <button className="secondary-button" type="button" onClick={() => { saveId(''); setLive(null); }}>Start another watch</button>}
    {error && <p className="notice wallet-error" role="alert">{error}</p>}
  </section>;
}
