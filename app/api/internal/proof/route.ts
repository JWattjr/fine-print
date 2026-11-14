import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PROBE_SOURCES } from '@/lib/probe-sources';
import { localJournalRequest, updateLocalProof } from '@/lib/local-proof';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!localJournalRequest(request)) return new NextResponse(null, { status: 404 });
  try {
    const path = resolve(process.cwd(), 'deploy', 'proof.json');
    const proof = JSON.parse(await readFile(path, 'utf8')) as {
      transactions?: Record<string, string>;
      receipts?: Record<string, Record<string, unknown>>;
      contracts?: Record<string, Record<string, unknown>>;
      probe?: Record<string, unknown>;
      probeResults?: Record<string, Record<string, unknown>>;
    };
    return NextResponse.json({
      ok: true,
      deployment: {
        hash: proof.transactions?.['deploy-ArchiveProbe'] ?? proof.probe?.hash,
        stage: proof.receipts?.['deploy-ArchiveProbe']?.stage ?? proof.probe?.stage,
        receipt: proof.receipts?.['deploy-ArchiveProbe'],
        sourceSha256: proof.probe?.sourceSha256,
        contractAddress: proof.contracts?.ArchiveProbe?.address,
      },
      probes: proof.probeResults ?? {},
    });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : 'The local proof journal could not be read.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!localJournalRequest(request)) return new NextResponse(null, { status: 404 });
  const input = await request.json() as { label?: string; hash?: string; account?: string; sourceSha256?: string; stage?: string; contractAddress?: string; receipt?: Record<string, unknown>; result?: Record<string, unknown>; passed?: boolean };
  const validLabel = input.label === 'deploy-ArchiveProbe' || /^probe-[a-z0-9-]{1,48}$/.test(input.label ?? '');
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.hash ?? '') || !validLabel || (input.stage && !['SUBMITTED','PENDING','ACCEPTED','FINALIZED_SUCCESS','FINALIZED_ERROR'].includes(input.stage)) || (input.contractAddress && !/^0x[\da-fA-F]{40}$/.test(input.contractAddress))) return NextResponse.json({ ok: false }, { status: 400 });
  const label = input.label!;
  return updateLocalProof((document) => {
  const proof = document as { transactions: Record<string,string>; receipts: Record<string,Record<string,unknown>>; contracts: Record<string,Record<string,unknown>>; probe?: Record<string,unknown>; probeResults?: Record<string,Record<string,unknown>>; blockers?: string[] };
  proof.transactions ??= {};
  proof.receipts ??= {};
  proof.contracts ??= {};
  proof.probeResults ??= {};
  if (proof.transactions[label] && proof.transactions[label] !== input.hash) return NextResponse.json({ ok: false, error: 'A different hash is already recorded for this one-shot action. It will not be replaced.' }, { status: 409 });
  if (label === 'deploy-ArchiveProbe' && proof.probe?.hash && proof.probe.hash !== input.hash) return NextResponse.json({ ok: false, error: 'A different probe deployment hash is already recorded. It will not be replaced.' }, { status: 409 });
  proof.transactions[label] = input.hash!;
  proof.receipts[label] = { ...(proof.receipts[label] ?? {}), stage: input.stage ?? proof.receipts[label]?.stage ?? 'SUBMITTED', ...(input.receipt ? { ...input.receipt } : {}), recordedAt: new Date().toISOString() };
  if (label === 'deploy-ArchiveProbe') {
    proof.probe = { ...(proof.probe ?? {}), hash: input.hash, signer: input.account ?? proof.probe?.signer, sourceSha256: input.sourceSha256 ?? proof.probe?.sourceSha256, submittedAt: proof.probe?.submittedAt ?? new Date().toISOString(), stage: input.stage ?? proof.probe?.stage ?? 'SUBMITTED' };
    if (input.contractAddress) {
      proof.contracts.ArchiveProbe = { address: input.contractAddress.toLowerCase(), explorer: `https://explorer-studio.genlayer.com/address/${input.contractAddress.toLowerCase()}`, sourceSha256: proof.probe.sourceSha256 };
      proof.probe.contractAddress = input.contractAddress.toLowerCase();
    }
  } else {
    const id = label.slice('probe-'.length);
    proof.probeResults[id] = { hash: input.hash, stage: input.stage ?? proof.probeResults[id]?.stage ?? 'SUBMITTED', ...(input.receipt ? { receipt: input.receipt } : {}), ...(input.result ? { result: input.result } : {}), ...(typeof input.passed === 'boolean' ? { passed: input.passed } : {}), recordedAt: new Date().toISOString() };
  }
  const verifiedSources = PROBE_SOURCES.filter((source) => proof.probeResults?.[source.id]?.stage === 'FINALIZED_SUCCESS' && proof.probeResults?.[source.id]?.passed === true).length;
  proof.blockers = (proof.blockers ?? []).filter((blocker) => !blocker.startsWith('ArchiveProbe:'));
  if (verifiedSources < PROBE_SOURCES.length) proof.blockers.push(`ArchiveProbe: ${verifiedSources} of ${PROBE_SOURCES.length} source checks are finalized and verified. All selected captures must pass before main contract deployment.`);
  return NextResponse.json({ ok: true });
  });
}
