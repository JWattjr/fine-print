import { Topline } from '@/components/topline';
import { CreditsManager } from '@/components/credits-manager';

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ wallet?: string }> }) {
  const query = await searchParams;
  return <><Topline /><div className="page"><header className="subhead"><div><h1>Credits & refunds</h1><p>Claim allocated wei from escrow. A payout is marked paid only after its linked native credit is verified.</p></div><span className="tag gray">Pull payments</span></header><CreditsManager initialWallet={query.wallet ?? ''} /></div></>;
}
