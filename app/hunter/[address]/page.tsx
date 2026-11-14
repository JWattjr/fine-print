import { LiveHunter } from '@/components/live-hunter';
import {Topline} from '@/components/topline';
import {notFound} from 'next/navigation';
import {hunterStats} from '@/lib/proof';

export default async function HunterPage({params}:{params:Promise<{address:string}>}){const{address}=await params;if(!/^0x[\da-fA-F]{40}$/.test(address))notFound();const stats=hunterStats(address);return <><Topline/><div className="page"><div className="profile-header"><div className="avatar">FP</div><div><h1>Hunter record</h1><p>{address}</p></div></div><div className="profile-stats"><div><strong>{stats.confirmed}</strong><span>Confirmed catches</span></div><div><strong>{stats.rejected}</strong><span>Rejected claims</span></div><div><strong>{stats.challengesWon}</strong><span>Challenges won</span></div></div><div className="section-rule"/><p className="quiet" style={{marginTop:20}}>Recorded proof snapshot. Use the live read below for current finalized ChangeLedger counts.</p><LiveHunter address={address} /></div></>}
