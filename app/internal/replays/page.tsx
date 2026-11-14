import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { notFound } from 'next/navigation';
import { Topline } from '@/components/topline';
import { ReplayDesk } from '@/components/replay-desk';
import type { ReplayPlan } from '@/lib/replay-plan';
export const dynamic = 'force-dynamic';

export default async function ReplaysPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const [planFile, proofFile] = await Promise.all([readFile(resolve(process.cwd(), 'deploy/case-plan.json'), 'utf8'), readFile(resolve(process.cwd(), 'deploy/proof.json'), 'utf8')]);
  const plan = JSON.parse(planFile) as { cases: ReplayPlan[] };
  const proof = JSON.parse(proofFile) as { depositApproval?: { approved?: boolean } };
  return <><Topline /><div className="page"><header className="subhead"><div><h1>Historical replay desk</h1><p>Exact third-party captures, fixed case IDs and honest finalized outcomes. StudioNet · 61999.</p></div><span className="tag red">Historical replay</span></header><div className="section-rule" /><ReplayDesk plans={plan.cases} nativeAllowed={proof.depositApproval?.approved === true} /></div></>;
}
