import { readFile } from 'node:fs/promises';
import { updateLocalProof } from '../lib/local-proof';

// Records a case whose judge_claim finalized without validator agreement, from receipts already on disk.
const id = process.argv[2];
const proof = JSON.parse(await readFile('deploy/proof.json', 'utf8'));
const plan = JSON.parse(await readFile('deploy/runner-plan.json', 'utf8')).cases.find((c: any) => c.id === id);
const receipts = proof.receipts as Record<string, any>;
const failure = (proof.caseFailures ?? []).find((f: any) => f.caseId === id);
if (!plan || !failure || receipts[failure.receiptKey]?.failureDisposition !== 'RETAINED_NOT_RETRIED') throw new Error('A retained, not-retried failure is required.');
const watch = receipts[`script:${id}:compile`].stateReadback;
const claim = receipts[`script:${id}:prepare`].stateReadback;
const transactions = Object.fromEntries(Object.entries<any>(receipts).filter(([k]) => k.startsWith(`script:${id}:`)).map(([k, v]) => [k, v.hash]));
const row = {
  id, sourceCaseId: id, company: 'Adobe', policyUrl: watch.url, concern: watch.concern, watchId: plan.watchId, claimId: plan.claimId, kind: 'CLAIM',
  criteria: (watch.criteria as string[]).map(text => ({ text, verdict: 'NOT_RUN' })),
  baseline: { url: watch.baseline_url, timestamp: watch.baseline_timestamp, digest: watch.baseline_digest, excerpt: watch.baseline_text_preview ?? '' },
  later: { url: claim.snapshot_url, timestamp: claim.snapshot_timestamp, digest: claim.snapshot_digest, excerpt: claim.snapshot_text_preview ?? '' },
  passage: claim.passage, verdict: 'NO_AGREEMENT',
  explanation: failure.reason, observedLimitation: 'Validators did not agree on this claim judgment (MAJORITY_DISAGREE). The finalized error is retained and was not retried; no verdict, challenge or payout exists for this case.',
  bountyWei: plan.bountyWei, claimant: claim.hunter, historicalReplay: true, status: 'FINALIZED_SUCCESS', finalized: true, stateVerified: true,
  transactions, stateReadback: { watch, claim },
};
await updateLocalProof(p => { const rows = (p.cases ??= []) as any[]; if (!rows.some(r => r.id === id)) rows.splice(5, 0, row); });
console.log('recorded', id);
