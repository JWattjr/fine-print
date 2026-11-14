/** Independent read-only SDK checks. stdout contains only the final safe report. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TransactionHashVariant } from 'genlayer-js/types';
import { getAddress } from 'viem';
import { createReadOnlyStudioClient } from '../lib/rpc-client';

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {};
const proof = JSON.parse(await readFile(new URL('../deploy/proof.json', import.meta.url), 'utf8')) as Row;
const contracts = object(proof.contracts);
const errors: string[] = [];
let requests = 0;
const budget = Math.max(0, Number(process.argv[2] ?? 150));
let lastRequest = Date.now();
const client = createReadOnlyStudioClient({ beforeRequest: async () => {
  if (requests >= budget) throw new Error('Read-only finalized-state request budget exhausted.');
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, lastRequest + 2500 - Date.now())));
  requests += 1; lastRequest = Date.now();
} });
const address = (name: string) => getAddress(String(object(contracts[name]).address));
const cache = new Map<string, Promise<Row>>();
function read(name: string, method: string, args: string[] = []): Promise<Row> {
  const key = JSON.stringify([name, method, args]);
  if (!cache.has(key)) cache.set(key, (async () => {
    const raw = await client.readContract({ address: address(name), functionName: method, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
    return object(typeof raw === 'string' ? JSON.parse(raw) : raw);
  })());
  return cache.get(key)!;
}
const same = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
function check(ok: unknown, message: string) { if (!ok) errors.push(message); }
async function inspect(label: string, task: () => Promise<void>) {
  try { await task(); } catch (cause) { errors.push(`${label}: ${cause instanceof Error ? cause.message : 'Finalized read failed.'}`); }
}

const peers: Record<string, Record<string, string>> = {
  Watches: { bounties: 'Bounties' }, Claims: { watches: 'Watches', bounties: 'Bounties', challenges: 'Challenges', ledger: 'ChangeLedger' },
  Challenges: { watches: 'Watches', claims: 'Claims', bounties: 'Bounties', ledger: 'ChangeLedger' },
  Bounties: { watches: 'Watches', claims: 'Claims', challenges: 'Challenges', ledger: 'ChangeLedger' },
  ChangeLedger: { watches: 'Watches', claims: 'Claims', challenges: 'Challenges', bounties: 'Bounties' },
};
for (const [name, entry] of Object.entries(contracts)) {
  await inspect(name, async () => {
    const code = await client.getContractCode(address(name));
    check(createHash('sha256').update(code).digest('hex') === object(entry).sourceSha256, `${name}: deployed source differs from its recorded SHA-256.`);
    if (name !== 'ArchiveProbe') {
      const config = await read(name, 'get_config');
      check(config.configured === true, `${name}: peer configuration is not finalized.`);
      for (const [field, peer] of Object.entries(peers[name] ?? {})) check(same(config[field], object(contracts[peer]).address), `${name}: finalized ${field} peer does not match the deployment manifest.`);
    }
  });
}
if (contracts.ArchiveProbe) for (const [id, recorded] of Object.entries(object(proof.probeResults))) {
  await inspect(`probe ${id}`, async () => {
    const actual = await read('ArchiveProbe', 'get_probe', [id]);
    const expected = object(object(recorded).result);
    for (const field of ['cdx_status', 'cdx_match', 'snapshot_status', 'snapshot_chars', 'archive_marker', 'gzip']) check(actual[field] === expected[field], `probe ${id}: finalized ${field} differs from the journal.`);
  });
}
for (const candidate of Array.isArray(proof.cases) ? proof.cases : []) {
  const item = object(candidate); const id = String(item.id);
  await inspect(`case ${id}`, async () => {
    const watch = await read('Watches', 'get_watch', [String(item.watchId)]);
    check(watch.finalized === true && watch.historical_replay === true && same(watch.url, item.policyUrl) && watch.concern === item.concern, `${id}: finalized replay watch identity differs.`);
    if (item.verdict === 'REJECTED') { check(watch.status === 'REJECTED', `${id}: compiler rejection is not present on-chain.`); return; }
    const baseline = object(item.baseline);
    check(watch.baseline_digest === baseline.digest && watch.baseline_url === baseline.url && watch.baseline_timestamp === baseline.timestamp, `${id}: frozen baseline differs from recorded evidence.`);
    const recordedCriteria = Array.isArray(item.criteria) ? item.criteria.map((criterion) => object(criterion).text) : [];
    check(JSON.stringify(watch.criteria) === JSON.stringify(recordedCriteria), `${id}: frozen criteria differ from the recorded case.`);
    const claim = await read('Claims', 'get_claim', [String(item.claimId)]);
    const upheld = object(item.challenge).ruling === 'UPHELD';
    check(claim.finalized === true && claim.watch_id === item.watchId && claim.passage === item.passage && same(claim.hunter, item.claimant), `${id}: finalized claim identity differs.`);
    check(claim.status === (upheld ? 'VOID' : item.verdict), `${id}: recorded verdict does not match the current finalized claim.`);
    check(!upheld || claim.voided === true, `${id}: upheld claim is not voided.`);
    if (item.verdict !== 'CODE_REJECTED') {
      const later = object(item.later);
      check(claim.snapshot_digest === later.digest && claim.snapshot_url === later.url && claim.snapshot_timestamp === later.timestamp, `${id}: later capture differs from the finalized claim.`);
    }
    const challenge = object(item.challenge);
    if (challenge.id) {
      const actual = await read('Challenges', 'get_challenge', [String(challenge.id)]);
      check(actual.finalized === true && actual.status === 'RESOLVED' && actual.claim_id === item.claimId && actual.ruling === challenge.ruling && actual.ground === challenge.ground, `${id}: challenge ruling differs from finalized state.`);
    } else check(!item.challenge, `${id}: recorded challenge is missing its on-chain ID.`);
    const payout = object(item.payout);
    if (payout.creditVerified === true) {
      const closure = await read('Challenges', 'get_claim_summary', [String(item.claimId)]);
      const settlement = await read('Bounties', 'get_settlement', [String(item.claimId)]);
      check(closure.finalized === true && closure.sealed === true && closure.pending === 0 && closure.upheld === false, `${id}: challenge intake is not safely closed.`);
      check(settlement.finalized === true && settlement.status === 'PAID' && settlement.credit_verified === true && same(settlement.recipient, payout.recipient) && String(settlement.amount_wei) === String(payout.amountWei) && same(settlement.child, payout.transactionHash), `${id}: native payout differs from finalized settlement.`);
      const ledger = await read('ChangeLedger', 'get_entry', [String(item.claimId)]);
      check(ledger.id === item.claimId && ledger.passage === item.passage && ledger.finalized === true, `${id}: verified payout has no matching immutable ledger entry.`);
    }
  });
}
for (const candidate of Array.isArray(proof.liveWatches) ? proof.liveWatches : []) {
  const item = object(candidate); const id = String(item.id);
  await inspect(`watch ${id}`, async () => {
    const watch = await read('Watches', 'get_watch', [id]);
    const escrow = await read('Bounties', 'get_watch_escrow', [id]);
    check(watch.finalized === true && watch.status === 'OPEN' && watch.historical_replay === false && Number(watch.expires_at) * 1000 > Date.now(), `${id}: production watch is not currently open.`);
    check(same(watch.url, item.policyUrl) && watch.concern === item.concern && watch.baseline_url === item.baselineUrl && watch.baseline_digest === item.baselineDigest && JSON.stringify(watch.criteria) === JSON.stringify(item.criteria), `${id}: live watch content differs from proof.`);
    check(escrow.finalized === true && escrow.status === 'FUNDED' && String(escrow.amount_wei) === String(item.bountyWei), `${id}: live bounty is not funded for the recorded amount.`);
    check(Number(watch.expires_at) * 1000 === Date.parse(String(item.expiresAt)), `${id}: expiry differs from finalized state.`);
  });
}
if (contracts.Bounties) await inspect('escrow accounting', async () => {
  const accounting = await read('Bounties', 'get_accounting');
  check(String(accounting.total_deposited_wei) === String(proof.depositedWei), 'Escrow total deposits differ from the transaction-level value journal.');
  check(BigInt(String(accounting.native_balance_wei)) >= BigInt(String(accounting.unpaid_liability_wei)), 'Escrow balance is below its unpaid liabilities.');
});
process.stdout.write(JSON.stringify({ ok: errors.length === 0, errors, requests, stateReads: cache.size }));
process.exitCode = errors.length ? 1 : 0;
