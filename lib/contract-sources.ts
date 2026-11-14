import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ContractName } from '@/lib/studio-contracts';
import { PROBE_SOURCES } from '@/lib/probe-sources';

const files: Record<ContractName, string> = { Watches: 'watches.py', Claims: 'claims.py', Challenges: 'challenges.py', Bounties: 'bounties.py', ChangeLedger: 'change_ledger.py' };
export async function contractSource(name: ContractName) {
  const code = await readFile(resolve(process.cwd(), 'contracts', files[name]), 'utf8');
  return { code, sha256: createHash('sha256').update(code).digest('hex'), file: `contracts/${files[name]}` };
}
export function sourcesVerified(proof: Record<string, unknown>) {
  const results = (proof.probeResults ?? {}) as Record<string, { stage?: string; passed?: boolean }>;
  return PROBE_SOURCES.every((source) => results[source.id]?.stage === 'FINALIZED_SUCCESS' && results[source.id]?.passed === true);
}
