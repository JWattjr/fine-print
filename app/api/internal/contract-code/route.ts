import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CONTRACT_NAMES, type ContractName } from '@/lib/studio-contracts';
import { contractSource, sourcesVerified } from '@/lib/contract-sources';
import { localJournalRequest } from '@/lib/local-proof';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!localJournalRequest(request)) return new NextResponse(null, { status: 404 });
  const name = new URL(request.url).searchParams.get('name') as ContractName;
  if (!CONTRACT_NAMES.includes(name)) return NextResponse.json({ ok: false }, { status: 400 });
  const proof = JSON.parse(await readFile(resolve(process.cwd(), 'deploy/proof.json'), 'utf8')) as Record<string, unknown>;
  if (!sourcesVerified(proof)) return NextResponse.json({ ok: false, error: 'Every selected archive capture must pass its finalized probe before main deployment.' }, { status: 409 });
  return NextResponse.json({ ok: true, name, ...await contractSource(name) });
}
