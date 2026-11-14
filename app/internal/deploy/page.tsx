import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { notFound } from 'next/navigation';
import { Topline } from '@/components/topline';
import { ContractDeploy } from '@/components/contract-deploy';
import { CONTRACT_NAMES } from '@/lib/studio-contracts';
import { contractSource, sourcesVerified } from '@/lib/contract-sources';
export const dynamic = 'force-dynamic';

export default async function DeployPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const proof = JSON.parse(await readFile(resolve(process.cwd(), 'deploy/proof.json'), 'utf8')) as Record<string, unknown>;
  const contracts = (proof.contracts ?? {}) as Record<string, { address?: string }>;
  const receipts = (proof.receipts ?? {}) as Record<string, { account?: string }>;
  const cards = await Promise.all(CONTRACT_NAMES.map(async (name) => ({ name, ...await contractSource(name), address: contracts[name]?.address, owner: receipts[`deploy-${name}`]?.account })));
  return <><Topline /><div className="page"><header className="subhead"><div><h1>Contract deployment journal</h1><p>Five contracts, pinned source hashes and one-time peer configuration. StudioNet · chain 61999.</p></div></header><div className="section-rule" /><ContractDeploy cards={cards.map(({ name, file, sha256, address, owner }) => ({ name, file, sha256, address, owner }))} verified={sourcesVerified(proof)} /></div></>;
}
