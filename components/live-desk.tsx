'use client';
import Link from 'next/link';
import { useState } from 'react';
import { contractsDeployed, type ReadSpec } from '@/lib/studio-contracts';
import { readStudio } from '@/lib/studio-actions';
import { ActionButton } from '@/components/action-button';
import { useClock } from '@/lib/form-storage';

type Mode = 'all' | 'ledger' | 'watches' | 'hunters';
type Row = Record<string, unknown>;
function object(value: unknown): Row { return value && typeof value === 'object' ? value as Row : {}; }
function rows(value: unknown): Row[] { return Array.isArray(value) ? value.map(object) : []; }
function service(url: unknown) { try { return new URL(String(url)).hostname; } catch { return 'Policy'; } }

export function LiveDesk({ mode = 'all' }: { mode?: Mode }) {
  const [data, setData] = useState<{ ledger?: Row; watches?: Row; hunters?: Row }>({});
  const [escrows, setEscrows] = useState<Record<string, Row>>({});
  const [offset, setOffset] = useState(0);
  const [readAt, setReadAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clock = useClock();

  async function load(page = offset) {
    setBusy(true); setError('');
    const requested: Array<[Exclude<Mode, 'all'>, ReadSpec]> = [];
    if (mode === 'all' || mode === 'ledger') requested.push(['ledger', { contract: 'ChangeLedger', method: 'list_entries', args: [page, 25] }]);
    if (mode === 'all' || mode === 'watches') requested.push(['watches', { contract: 'Watches', method: 'list_watches', args: [page, 25] }]);
    if (mode === 'all' || mode === 'hunters') requested.push(['hunters', { contract: 'ChangeLedger', method: 'list_hunters', args: [page, 25] }]);
    const results = await Promise.allSettled(requested.map(async ([kind, spec]) => ({ kind, ...await readStudio(spec) })));
    const next: typeof data = {};
    const errors: string[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') { next[result.value.kind] = object(result.value.value); setReadAt(result.value.readAt); }
      else errors.push(result.reason instanceof Error ? result.reason.message : 'A live collection read failed.');
    }
    setData(next); setOffset(page);
    if (next.watches) {
      const open = rows(next.watches.watches).filter((watch) => watch.finalized === true && watch.status === 'OPEN' && watch.historical_replay === false && Number(watch.expires_at) * 1000 > clock);
      const funded = await Promise.allSettled(open.map(async (watch) => ({ id: String(watch.id), value: object((await readStudio({ contract: 'Bounties', method: 'get_watch_escrow', args: [String(watch.id)] })).value) })));
      const balances: Record<string, Row> = {};
      for (const result of funded) { if (result.status === 'fulfilled') balances[result.value.id] = result.value.value; else errors.push('A watch escrow read is unavailable.'); }
      setEscrows(balances);
    }
    setError(errors.join(' ')); setBusy(false);
  }

  const entries = rows(data.ledger?.entries).filter((entry) => entry.finalized === true && object(entry.payout).credit_verified === true);
  const watches = rows(data.watches?.watches).filter((watch) => watch.finalized === true && watch.status === 'OPEN' && watch.historical_replay === false && Number(watch.expires_at) * 1000 > clock);
  const hunters = rows(data.hunters?.hunters).sort((a, b) => Number(b.confirmed_catches) - Number(a.confirmed_catches) || Number(b.challenges_won) - Number(a.challenges_won));
  const total = Number(data[mode === 'all' ? 'ledger' : mode]?.total ?? 0);
  return <section className="live-section form-stack">
    <div className="transaction-heading"><div><h2 className="section-label">Live finalized {mode === 'all' ? 'reads' : mode}</h2><p className="helper">Direct StudioNet state · chain 61999 · separate from the recorded proof above</p></div><button className="secondary-button" disabled={busy || !contractsDeployed()} type="button" onClick={() => void load()}>{busy ? 'Reading finalized contracts…' : 'Read StudioNet now'}</button></div>
    {!contractsDeployed() && <p className="notice">The main contract deployment addresses have not been published yet.</p>}
    {readAt && <p className="quiet">Read at {new Date(readAt).toLocaleString()} · latest-final</p>}
    {data.ledger && <><h3>ChangeLedger</h3><table className="ledger-table"><thead><tr><th>Policy</th><th>Triggered criterion</th><th>Verified native payout</th><th>Case</th></tr></thead><tbody>{entries.length ? entries.map((entry) => <tr key={String(entry.id)}><td>{service(entry.url)}{entry.historical_replay === true && <small className="tag red">Historical replay</small>}</td><td>{rows(entry.triggered).map((item) => String(item.criterion)).join(' · ')}</td><td>{String(object(entry.payout).amount_wei)} wei</td><td><Link className="inline-link" href={`/case/chain-${String(entry.id)}`}>Read live case →</Link></td></tr>) : <tr><td colSpan={4} className="table-empty">No finalized paid changes on this page.</td></tr>}</tbody></table></>}
    {data.watches && <><h3>Open production watches</h3><table className="ledger-table"><thead><tr><th>Policy / baseline</th><th>Frozen concern</th><th>Current bounty</th><th>Expires</th><th>Take part</th></tr></thead><tbody>{watches.length ? watches.map((watch) => <tr key={String(watch.id)}><td>{service(watch.url)}<small><a className="inline-link" href={String(watch.baseline_url)} target="_blank" rel="noreferrer">Wayback {String(watch.baseline_timestamp)} ↗</a></small></td><td>{String(watch.concern)}<small>{Array.isArray(watch.criteria) ? watch.criteria.join(' · ') : ''}</small></td><td>{escrows[String(watch.id)]?.status === 'FUNDED' ? `${String(escrows[String(watch.id)].amount_wei)} wei` : 'Escrow read pending'}</td><td>{new Date(Number(watch.expires_at) * 1000).toLocaleString()}</td><td><Link className="inline-link" href={`/claims/new?watch=${String(watch.id)}`}>File a claim →</Link></td></tr>) : <tr><td colSpan={5} className="table-empty">No funded open production watches on this page.</td></tr>}</tbody></table><details><summary>Expired production watch refunds</summary>{rows(data.watches.watches).filter((watch) => watch.historical_replay === false && watch.status === 'OPEN' && Number(watch.expires_at) * 1000 <= clock).map((watch) => <div className="probe-card" key={String(watch.id)}><strong>{service(watch.url)} · {String(watch.id)}</strong><ActionButton spec={{ key: `watch:refund:${String(watch.id)}`, label: 'Refund expired unclaimed watch bounty', contract: 'Bounties', method: 'refund_watch', args: [String(watch.id)], recovery: true, readback: { contract: 'Bounties', method: 'get_watch_escrow', args: [String(watch.id)], until: { field: 'status', equals: 'REFUNDED' } } }}>Reserve sponsor refund</ActionButton></div>)}</details></>}
    {data.hunters && <><h3>Hunter records</h3><table className="ledger-table"><thead><tr><th>Hunter</th><th>Confirmed catches</th><th>Rejected claims</th><th>Challenges won</th></tr></thead><tbody>{hunters.length ? hunters.map((hunter) => <tr key={String(hunter.address)}><td><Link href={`/hunter/${String(hunter.address)}`}>{String(hunter.address)}</Link></td><td>{String(hunter.confirmed_catches)}</td><td>{String(hunter.rejected_claims)}</td><td>{String(hunter.challenges_won)}</td></tr>) : <tr><td colSpan={4} className="table-empty">No finalized hunter records on this page.</td></tr>}</tbody></table></>}
    {readAt && mode !== 'all' && total > 25 && <div className="button-row"><button className="secondary-button" disabled={offset === 0 || busy} type="button" onClick={() => void load(Math.max(0, offset - 25))}>Previous page</button><button className="secondary-button" disabled={offset + 25 >= total || busy} type="button" onClick={() => void load(offset + 25)}>Next page</button></div>}
    {error && <p role="status" className="wallet-error">{error} The recorded proof remains a separate snapshot.</p>}
  </section>;
}
