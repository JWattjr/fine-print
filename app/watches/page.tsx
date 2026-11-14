import { LiveDesk } from '@/components/live-desk';
import Link from 'next/link';
import { Topline } from '@/components/topline';
import { openWatches, proof } from '@/lib/proof';

export default function WatchesPage(){
  const watches=openWatches();
  return <><Topline/><div className="page"><header className="subhead"><div><h1>Open watches</h1><p>Every funded watch has finalized criteria, a pinned Wayback baseline and a public expiry.</p></div><Link className="primary-button" href="/watches/new">Start a watch</Link></header><div className="section-rule"/>{watches.length===0?<div className="notice" style={{marginTop:20}}>No funded production watches are open. Historical replay cases do not count as live watches.</div>:null}<table className="ledger-table"><thead><tr><th>Policy</th><th>Concern</th><th>Frozen criteria</th><th>Bounty</th><th>Expires</th><th>State</th></tr></thead><tbody>{watches.length?watches.map(watch=><tr key={watch.id}><td><a href={watch.baselineUrl} target="_blank" rel="noreferrer">{watch.company} ↗</a><small><a href={watch.baselineUrl} target="_blank" rel="noreferrer">Baseline · {watch.baselineTimestamp} ↗</a></small></td><td>{watch.concern}</td><td>{watch.criteria.join(' · ')}</td><td>{watch.bountyWei} wei</td><td>{new Date(watch.expiresAt).toLocaleString('en-GB',{timeZone:'UTC'})} UTC</td><td><span className="tag">OPEN</span></td></tr>):<tr><td colSpan={6} className="table-empty">No funded live watches.</td></tr>}</tbody></table><p className="quiet" style={{marginTop:20}}>Network: {proof.network.name} · chain {proof.network.chainId} · transactions appear after finality.</p><LiveDesk mode="watches" /></div></>;
}
