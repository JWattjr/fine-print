import { LiveDesk } from '@/components/live-desk';
import {Topline} from '@/components/topline';
import Link from 'next/link';
import { proof, hunterStats } from '@/lib/proof';

export default function HuntersPage(){
  const addresses=new Set<string>();
  for(const item of proof.cases){if(item.claimant)addresses.add(item.claimant.toLowerCase());if(item.challenge?.challenger)addresses.add(item.challenge.challenger.toLowerCase());}
  const rows=[...addresses].map(address=>({address,...hunterStats(address)})).filter(row=>row.confirmed+row.rejected+row.challengesWon>0).sort((a,b)=>b.confirmed-a.confirmed||b.challengesWon-a.challengesWon);
  return <><Topline/><div className="page"><header className="subhead"><div><h1>Hunter index</h1><p>A public record of confirmed catches, rejected claims and challenges won.</p></div><span className="tag gray">{rows.length} hunters</span></header><div className="section-rule"/><table className="ledger-table"><thead><tr><th>Hunter</th><th>Confirmed catches</th><th>Rejected claims</th><th>Challenges won</th></tr></thead><tbody>{rows.length?rows.map(row=><tr key={row.address}><td><Link href={`/hunter/${row.address}`}>{row.address}</Link></td><td>{row.confirmed}</td><td>{row.rejected}</td><td>{row.challengesWon}</td></tr>):<tr><td colSpan={4} className="table-empty">No finalized hunter history.</td></tr>}</tbody></table><p className="quiet" style={{marginTop:20}}>Recorded proof snapshot. Read the live index below for current finalized ChangeLedger history.</p><LiveDesk mode="hunters" /></div></>;
}
