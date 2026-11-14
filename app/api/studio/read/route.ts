import { NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { TransactionHashVariant } from 'genlayer-js/types';
import { createReadOnlyStudioClient } from '@/lib/rpc-client';
import { CONTRACT_NAMES, VIEW_METHODS, contractAddress, compactReadback, type ContractName } from '@/lib/studio-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const input = await request.json() as { contract?: ContractName; method?: string; args?: unknown[]; focus?: string };
    if (!input.contract || !CONTRACT_NAMES.includes(input.contract) || !input.method || !VIEW_METHODS[input.contract].includes(input.method)
      || !Array.isArray(input.args) || input.args.length > 3 || JSON.stringify(input.args).length > 5000
      || (input.focus !== undefined && (typeof input.focus !== 'string' || input.focus.length > 1200))
      || input.args.some((arg) => !['string', 'number', 'boolean'].includes(typeof arg) || (typeof arg === 'number' && !Number.isSafeInteger(arg)))) {
      return NextResponse.json({ ok: false, error: 'Choose a supported contract view and bounded arguments.' }, { status: 400 });
    }
    const address = contractAddress(input.contract);
    if (!address) return NextResponse.json({ ok: false, error: 'This contract has not been deployed yet.' }, { status: 503 });
    const client = createReadOnlyStudioClient();
    const raw = await client.readContract({ address: getAddress(address), functionName: input.method, args: input.args as Array<string | number | boolean>, transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return NextResponse.json({ ok: true, value: compactReadback(value, input.focus), network: 61999, state: 'latest-final', readAt: new Date().toISOString() });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : 'The finalized StudioNet read is unavailable.' }, { status: 502 });
  }
}
