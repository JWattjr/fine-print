import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import { RunnerFunding } from '@/components/runner-funding';
import account from '@/deploy/test-account.json';
export const dynamic = 'force-dynamic';
export default async function RunnerPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const proof = JSON.parse(await readFile('deploy/proof.json', 'utf8'));
  return <div className="page"><h1>Fine Print test runner funding</h1><RunnerFunding address={account.address} savedHash={proof.runnerFunding?.hash ?? ''} /></div>;
}
