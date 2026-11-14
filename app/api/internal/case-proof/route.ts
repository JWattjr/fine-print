import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getAddress } from 'viem';
import { TransactionHashVariant } from 'genlayer-js/types';
import { localJournalRequest, updateLocalProof } from '@/lib/local-proof';
import { createReadOnlyStudioClient } from '@/lib/rpc-client';
import { compactReadback, contextExcerpt, type ContractName } from '@/lib/studio-contracts';
import { replayIds, type ReplayPlan } from '@/lib/replay-plan';
import type { CaseProof } from '@/lib/proof';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {};

export async function POST(request: Request) {
  if (!localJournalRequest(request)) return new NextResponse(null, { status: 404 });
  try {
    const input = await request.json() as { caseId?: string };
    const plans = JSON.parse(await readFile(resolve(process.cwd(), 'deploy/case-plan.json'), 'utf8')) as { cases: ReplayPlan[] };
    const plan = plans.cases.find((candidate) => candidate.id === input.caseId);
    if (!plan) return NextResponse.json({ ok: false, error: 'Choose a planned one-time case.' }, { status: 400 });
    const ids = replayIds(plan.id);
    const initial = JSON.parse(await readFile(resolve(process.cwd(), 'deploy/proof.json'), 'utf8')) as Row;
    const contracts = object(initial.contracts);
    const client = createReadOnlyStudioClient();
    async function read(name: ContractName, method: string, id: string) {
      const raw = await client.readContract({ address: getAddress(String(object(contracts[name]).address)), functionName: method, args: [id], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
      return object(typeof raw === 'string' ? JSON.parse(raw) : raw);
    }
    const watch = await read('Watches', 'get_watch', ids.watch);
    if (watch.finalized !== true || watch.historical_replay !== true || watch.concern !== plan.concern || watch.url !== plan.baseline.original || watch.as_of !== plan.baseline.timestamp) throw new Error('A finalized historical watch with the exact planned identity is required.');
    const compileOnly = ['REJECTED', 'VOID'].includes(String(watch.status));
    const claim = compileOnly ? {} : await read('Claims', 'get_claim', ids.claim);
    if (!compileOnly && (claim.finalized !== true || claim.watch_id !== ids.watch || claim.passage !== plan.passage || claim.snapshot_url !== plan.later?.url || !['TRIGGERED', 'NOT_TRIGGERED', 'UNCLEAR', 'VOID', 'CODE_REJECTED'].includes(String(claim.status)))) throw new Error('The actual claim result has not finalized with the exact planned passage and capture.');
    const challengeNeeded = !compileOnly && !!plan.challenge && (claim.status === 'TRIGGERED' || claim.voided === true);
    const challenge = challengeNeeded ? await read('Challenges', 'get_challenge', ids.challenge) : {};
    if (challengeNeeded && (challenge.finalized !== true || challenge.status !== 'RESOLVED' || challenge.claim_id !== ids.claim || challenge.ground !== plan.challenge?.ground || challenge.argument !== plan.challenge?.argument || challenge.baseline_passage !== plan.challenge?.baselinePassage)) throw new Error('The exact planned challenge has not finalized; no complete case outcome was written.');
    const closure = !compileOnly && ['TRIGGERED', 'VOID'].includes(String(claim.status)) ? await read('Challenges', 'get_claim_summary', ids.claim) : {};
    const settlement = !compileOnly && claim.status === 'TRIGGERED' ? await read('Bounties', 'get_settlement', ids.claim) : {};
    const results = Array.isArray(claim.results) ? claim.results.map(object) : [];
    const passage = typeof claim.passage === 'string' ? claim.passage : '';
    const company = plan.baseline.original.includes('zoom.us') ? 'Zoom' : plan.baseline.original.includes('adobe.com') ? 'Adobe' : 'X';
    const actualVerdict = String(compileOnly ? watch.status : claim.status) as CaseProof['verdict'];
    if (!['TRIGGERED', 'NOT_TRIGGERED', 'UNCLEAR', 'REJECTED', 'CODE_REJECTED', 'VOID'].includes(actualVerdict)) throw new Error('Unknown actual verdict; refusing to infer one.');
    const criteria = (Array.isArray(watch.criteria) ? watch.criteria : []).map((text, index) => {
      const result = results.find((row) => row.criterion_index === index);
      return { text: String(text), verdict: String(result?.verdict ?? 'NOT_RUN') as CaseProof['criteria'][number]['verdict'], ...(typeof result?.quote === 'string' ? { quote: result.quote } : {}) };
    });
    const row: CaseProof = {
      id: plan.id, company, kind: compileOnly ? 'COMPILE' : 'CLAIM', policyUrl: String(watch.url), concern: String(watch.concern),
      watchId: ids.watch, ...(!compileOnly ? { claimId: ids.claim } : {}), criteria,
      baseline: { url: String(watch.baseline_url ?? ''), timestamp: String(watch.baseline_timestamp ?? ''), digest: String(watch.baseline_digest ?? ''), excerpt: contextExcerpt(String(watch.baseline_text ?? ''), passage || plan.passage) },
      later: { url: String(claim.snapshot_url ?? ''), timestamp: String(claim.snapshot_timestamp ?? ''), digest: String(claim.snapshot_digest ?? ''), excerpt: contextExcerpt(String(claim.snapshot_text ?? ''), passage) },
      passage, verdict: actualVerdict,
      explanation: claim.voided === true ? `The initial judgment triggered the concern; finalized challenge ${String(challenge.ruling)} voided the claim. ${String(challenge.reason ?? '')}` : String((compileOnly ? watch.reason : claim.reason) ?? '') + (!compileOnly && plan.challenge && !challengeNeeded ? ' The planned challenge was not opened because the claim did not trigger.' : ''),
      bountyWei: String(watch.bounty_wei), claimant: String(claim.hunter ?? watch.sponsor), historicalReplay: true,
      status: 'FINALIZED_SUCCESS', finalized: true, stateVerified: true,
      stateReadback: compactReadback({ watch, claim, challenge, closure, settlement }, passage || plan.passage), transactions: {},
      ...(!compileOnly && Number(claim.challenge_deadline) > 0 ? { challengeWindow: { deadline: new Date(Number(claim.challenge_deadline) * 1000).toISOString(), closed: closure.finalized === true && closure.sealed === true && closure.pending === 0 } } : {}),
      ...(challengeNeeded ? { challenge: { id: ids.challenge, ground: String(challenge.ground), evidence: String(challenge.baseline_passage || challenge.argument || ''), challenger: String(challenge.challenger), ruling: String(challenge.ruling) } } : {}),
      ...(settlement.finalized === true && settlement.status === 'PAID' && settlement.credit_verified === true ? { payout: { amountWei: String(settlement.amount_wei), recipient: String(settlement.recipient), transactionHash: String(settlement.child), creditVerified: true } } : {}),
    };
    await updateLocalProof((proof) => {
      const receipts = object(proof.receipts);
      for (const [key, raw] of Object.entries(receipts)) {
        const receipt = object(raw);
        const args = JSON.stringify(receipt.args ?? []);
        if (key.startsWith(`replay:${plan.id}:`) || [ids.watch, ids.claim, ids.challenge].some((id) => args.includes(id))) {
          if (receipt.stage !== 'FINALIZED_SUCCESS') throw new Error(`Related transaction ${key} is not finalized-success. Its existing journal entry is preserved.`);
          row.transactions[key] = String(receipt.hash);
        }
      }
      if (!Object.keys(row.transactions).length) throw new Error('Actual finalized transaction receipts are missing from the local journal.');
      if (row.challenge) row.challenge.transactionHash = row.transactions[`replay:${plan.id}:challenge-judge`];
      const cases = (proof.cases ??= []) as CaseProof[];
      const index = cases.findIndex((candidate) => candidate.id === row.id);
      if (index >= 0 && (cases[index].watchId !== row.watchId || cases[index].claimId !== row.claimId)) throw new Error('A case cannot be replaced with different on-chain IDs.');
      if (index >= 0) cases[index] = row; else cases.push(row);
      proof.recordedAt = new Date().toISOString();
    });
    return NextResponse.json({ ok: true, caseId: row.id, verdict: row.verdict, challengeRuling: row.challenge?.ruling, nativeCreditVerified: row.payout?.creditVerified === true });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : 'Actual case proof could not be recorded.' }, { status: 409 });
  }
}
