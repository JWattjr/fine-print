/** Record an open production watch from finalized reads; never submits transactions. */
import { readFile } from 'node:fs/promises';
import { getAddress } from 'viem';
import { TransactionHashVariant } from 'genlayer-js/types';
import { createReadOnlyStudioClient } from '../lib/rpc-client';
import { updateLocalProof } from '../lib/local-proof';

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {};
const [id, company] = process.argv.slice(2);
if (!id || !company) throw new Error('Usage: record_live_watch.ts WATCH_ID COMPANY');
const initial = JSON.parse(await readFile('deploy/proof.json', 'utf8')) as Row;
const contracts = object(initial.contracts);
let last = Date.now();
const client = createReadOnlyStudioClient({ beforeRequest: async () => {
  await new Promise(resolve => setTimeout(resolve, Math.max(0, last + 3000 - Date.now())));
  last = Date.now();
} });
async function read(contract: string, method: string) {
  const raw = await client.readContract({ address: getAddress(String(object(contracts[contract]).address)), functionName: method, args: [id], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  return object(typeof raw === 'string' ? JSON.parse(raw) : raw);
}
const watch = await read('Watches', 'get_watch');
const escrow = await read('Bounties', 'get_watch_escrow');
if (watch.id !== id || watch.finalized !== true || watch.status !== 'OPEN' || watch.historical_replay !== false || Number(watch.expires_at) * 1000 <= Date.now()) throw new Error('Watch is not a finalized, open production watch.');
if (escrow.finalized !== true || escrow.status !== 'FUNDED' || String(escrow.amount_wei) !== String(watch.bounty_wei)) throw new Error('Exact bounty is not finalized and funded.');
await updateLocalProof(proof => {
  const receipts = object(proof.receipts);
  const transactions: Record<string, string> = {};
  const related = new Set([id]);
  for (const value of Object.values(receipts)) {
    const receipt = object(value);
    if (receipt.method === 'prepare_deposit' && Array.isArray(receipt.args) && receipt.args[2] === id) related.add(String(receipt.args[0]));
  }
  for (const [key, value] of Object.entries(receipts)) {
    const receipt = object(value);
    if (Array.isArray(receipt.args) && receipt.args.some(arg => related.has(String(arg)))) {
      if (receipt.stage !== 'FINALIZED_SUCCESS' || receipt.stateVerified !== true) throw new Error('Related receipt is not finalized and read back.');
      transactions[key] = String(receipt.hash);
    }
  }
  if (!Object.keys(transactions).length) throw new Error('Missing finalized journal receipts.');
  const row = { id, company, policyUrl: watch.url, concern: watch.concern, criteria: watch.criteria, baselineUrl: watch.baseline_url, baselineTimestamp: watch.baseline_timestamp, baselineDigest: watch.baseline_digest, bountyWei: String(watch.bounty_wei), expiresAt: new Date(Number(watch.expires_at) * 1000).toISOString(), status: 'OPEN', historicalReplay: false, stateVerified: true, stateReadback: { watch, escrow }, transactions };
  const rows = (proof.liveWatches ??= []) as Row[];
  const index = rows.findIndex(item => item.id === id);
  if (index >= 0) rows[index] = row; else rows.push(row);
  proof.recordedAt = new Date().toISOString();
});
console.log(JSON.stringify({ ok: true, id, status: watch.status, bountyWei: watch.bounty_wei, expiresAt: watch.expires_at }));
