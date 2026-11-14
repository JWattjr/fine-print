import { NextResponse } from 'next/server';
import { decodeLocalnetTransaction } from 'genlayer-js';
import type { TransactionHash } from 'genlayer-js/types';
import { createReadOnlyStudioClient } from '@/lib/rpc-client';
import { transactionView } from '@/lib/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^0x[\da-fA-F]{64}$/.test(hash)) return NextResponse.json({ ok: false, error: 'Invalid transaction hash.' }, { status: 400 });
  try {
    const client = createReadOnlyStudioClient();
    const raw = await client.getTransaction({ hash: hash as TransactionHash });
    const decoded = decodeLocalnetTransaction(raw as never);
    const view = transactionView(decoded);
    if (view.hash && view.hash.toLowerCase() !== hash.toLowerCase()) return NextResponse.json({ ok: false, error: 'StudioNet returned a different transaction hash.' }, { status: 502 });
    return NextResponse.json({ ok: true, transaction: { ...view, hash } });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : 'StudioNet transaction lookup failed.' }, { status: 502 });
  }
}
