import { NextResponse } from 'next/server';
import { localJournalRequest, updateLocalProof } from '@/lib/local-proof';
import account from '@/deploy/test-account.json';
export async function POST(request: Request) {
  if (!localJournalRequest(request)) return new NextResponse(null, { status: 404 });
  const { hash } = await request.json();
  if (typeof hash !== 'string' || !/^0x[\da-fA-F]{64}$/.test(hash)) return NextResponse.json({ error: 'Invalid transfer hash.' }, { status: 400 });
  await updateLocalProof(proof => {
    const previous = proof.runnerFunding as { hash?: string } | undefined;
    if (previous?.hash && previous.hash !== hash) throw new Error('Funding transfer already recorded.');
    proof.runnerFunding = { hash, address: account.address, amountWei: '1000', chainId: 61999, status: 'SUBMITTED' };
  });
  return NextResponse.json({ ok: true });
}
