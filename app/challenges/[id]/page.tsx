import { Topline } from '@/components/topline';
import { ChallengeForm } from '@/components/challenge-form';

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><Topline /><div className="page"><header className="subhead"><div><h1>Challenge a claim</h1><p>Use one ground during the open window. Validators fetch both frozen documents independently.</p></div><span className="tag gray">Finalized claim state</span></header><div className="form-layout"><ChallengeForm initialClaim={id === 'new' ? '' : id} /><aside className="form-aside"><h3>Already existed</h3><p>Supply a passage from the frozen baseline. Code checks its presence before a bond is accepted. Validators then decide whether it already grants the substance described by the triggered criteria.</p><h3>Wrong document</h3><p>Validators compare bounded extracts from both pinned snapshots for a different document, archive error or locale.</p><h3>Bond outcomes</h3><p>An upheld challenge voids the claim and awards the hunter’s bond to the challenger. A rejected challenge awards the challenge bond to the hunter. Unclear or unreachable evidence voids the challenge and makes its bond refundable.</p></aside></div></div></>;
}
