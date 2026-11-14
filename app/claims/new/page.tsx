import { Topline } from '@/components/topline';
import { ClaimForm } from '@/components/claim-form';

export default async function NewClaimPage({ searchParams }: { searchParams: Promise<{ watch?: string }> }) {
  const query = await searchParams;
  return <><Topline /><div className="page"><header className="subhead"><div><h1>File a claim</h1><p>Show the exact new passage. Archive checks run before a bond or a validator judgment.</p></div><span className="tag gray">Wayback evidence only</span></header><div className="form-layout"><ClaimForm initialWatch={query.watch ?? ''} /><aside className="form-aside"><h3>Use the frozen baseline</h3><p>Load the watch from finalized StudioNet state. Its baseline and criteria cannot be edited by a claimant.</p><h3>Check, then stake</h3><p>The preview fetches the exact captures. The contract independently verifies the same passage checks. A failed code check accepts no bond and calls no model.</p><h3>One narrow judgment</h3><p>After the bond finalizes, validators judge each frozen criterion. TRIGGERED opens a challenge window, NOT_TRIGGERED forfeits the bond to the watch, and UNCLEAR makes it refundable.</p></aside></div></div></>;
}
