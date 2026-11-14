import { NextResponse } from 'next/server';
import { CONTRACT_NAMES } from '@/lib/studio-contracts';
import { localJournalRequest, updateLocalProof } from '@/lib/local-proof';
import type { ActionRecord } from '@/lib/studio-actions';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { contractSource } from '@/lib/contract-sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const stages = ['SUBMITTED', 'PENDING', 'ACCEPTED', 'FINALIZED_SUCCESS', 'FINALIZED_ERROR'];

export async function GET(request: Request) {
  if (!localJournalRequest(request)) return new NextResponse(null, { status: 404 });
  const proof = JSON.parse(await readFile(resolve(process.cwd(), 'deploy/proof.json'), 'utf8')) as { receipts?: Record<string, ActionRecord> };
  return NextResponse.json({ ok: true, actions: Object.values(proof.receipts ?? {}).filter((record) => record.key && record.account && record.submittedAt && CONTRACT_NAMES.includes(record.contract)) });
}

export async function POST(request: Request) {
  if (!localJournalRequest(request)) return new NextResponse(null, { status: 404 });
  try {
    const body = await request.text();
    if (body.length > 100000) return NextResponse.json({ ok: false, error: 'Journal record is too large.' }, { status: 413 });
    const input = JSON.parse(body) as ActionRecord;
    if (!/^0x[\da-fA-F]{64}$/.test(input.hash ?? '') || !/^0x[\da-fA-F]{40}$/.test(input.account ?? '')
      || !/^[\w:-]{1,240}$/.test(input.key ?? '') || !CONTRACT_NAMES.includes(input.contract)
      || !/^[a-z_]{1,48}$/.test(input.method ?? '') || !Array.isArray(input.args) || input.args.length > 10
      || !stages.includes(input.stage ?? '') || !/^\d{1,18}$/.test(input.valueWei ?? '0')
      || BigInt(input.valueWei ?? '0') > 100000000000000000n || !Number.isFinite(Date.parse(input.submittedAt))) {
      return NextResponse.json({ ok: false, error: 'Invalid action journal record.' }, { status: 400 });
    }
    await updateLocalProof(async (proof) => {
      const transactions = (proof.transactions ??= {}) as Record<string, string>;
      const receipts = (proof.receipts ??= {}) as Record<string, Record<string, unknown>>;
      if (transactions[input.key] && transactions[input.key].toLowerCase() !== input.hash.toLowerCase()) throw new Error('A different hash is already recorded for this action.');
      transactions[input.key] = input.hash;
      const previous = receipts[input.key];
      if (String(previous?.stage).startsWith('FINALIZED') && !input.stage?.startsWith('FINALIZED')) return;
      receipts[input.key] = {
        key: input.key, hash: input.hash, label: input.label, account: input.account, contract: input.contract, method: input.method,
        args: input.args, valueWei: input.valueWei ?? '0', historicalReplay: input.historicalReplay === true,
        submittedAt: input.submittedAt, stage: input.stage, status: input.status, execution: input.execution,
        consensus: input.consensus, triggeredTransactions: input.triggeredTransactions, triggeredBy: input.triggeredBy,
        valueCredited: input.valueCredited, stateVerified: input.stateVerified, stateReadback: input.stateReadback,
        readAt: input.readAt, readError: input.readError, readback: input.readback, expectedAccount: input.expectedAccount,
        recovery: input.recovery, sourceSha256: input.sourceSha256, contractAddress: input.contractAddress, recordedAt: new Date().toISOString(),
      };
      if (input.method === 'deploy' && input.stage === 'FINALIZED_SUCCESS' && /^0x[\da-fA-F]{40}$/.test(input.contractAddress ?? '')) {
        const source = await contractSource(input.contract);
        if (source.sha256 !== input.sourceSha256) throw new Error('Contract source changed after deployment. Preserve the deployed source before continuing.');
        const contracts = (proof.contracts ??= {}) as Record<string, Record<string, unknown>>;
        const address = input.contractAddress!.toLowerCase();
        if (contracts[input.contract]?.address && contracts[input.contract].address !== address) throw new Error('A different deployed contract address is already recorded.');
        contracts[input.contract] = { address, explorer: `https://explorer-studio.genlayer.com/address/${address}`, sourceSha256: source.sha256, transactionHash: input.hash };
        const path = resolve(process.cwd(), 'deploy/contracts.json');
        const manifest = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
        manifest[input.contract] = contracts[input.contract];
        await writeFile(`${path}.pending`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        await rename(`${path}.pending`, path);
      }
      const transfers = (proof.valueTransfers ??= []) as Array<{ label: string; hash: string; amountWei: string; purpose?: string; stage?: string; valueCredited?: boolean }>;
      if (BigInt(input.valueWei ?? '0') > 0n) {
        let transfer = transfers.find((item) => item.hash.toLowerCase() === input.hash.toLowerCase());
        if (!transfer) { transfer = { label: input.key, hash: input.hash, amountWei: input.valueWei!, purpose: `${input.contract}.${input.method}` }; transfers.push(transfer); }
        transfer.stage = input.stage;
        if (typeof input.valueCredited === 'boolean') transfer.valueCredited = input.valueCredited;
      }
      // Reserve pending amounts conservatively. Exclude only proved final uncredited calls.
      proof.depositedWei = transfers.reduce((sum, item) => sum + (item.stage?.startsWith('FINALIZED') && item.valueCredited === false ? 0n : BigInt(item.amountWei)), 0n).toString();
    });
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : 'Journal update failed.' }, { status: 409 });
  }
}
