/** Independent read-only SDK checks. stdout contains only the final safe report. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TransactionHashVariant } from 'genlayer-js/types';
import { getAddress } from 'viem';
import { createReadOnlyStudioClient } from '../lib/rpc-client';
import { verificationSlot } from './verification-budget';

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
  await verificationSlot();
  requests += 1; lastRequest = Date.now();
} });
const address = (name: string) => getAddress(String(object(contracts[name]).address));
const cache = new Map<string, Promise<Row>>();
async function retryRead<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (attempt >= 3 || !/JSON|unexpected token|timeout|timed out|fetch|429|temporar|unknown RPC|ECONN/i.test(message)) throw cause;
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}
function read(name: string, method: string, args: string[] = []): Promise<Row> {
  const key = JSON.stringify([name, method, args]);
  if (!cache.has(key)) cache.set(key, (async () => {
    const raw = await retryRead(() => client.readContract({ address: address(name), functionName: method, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL }));
    return object(typeof raw === 'string' ? JSON.parse(raw) : raw);
  })());
  return cache.get(key)!;
}
const same = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const normalizedText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
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
    const code = await retryRead(() => client.getContractCode(address(name)));
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
for(const candidate of Object.values(object(proof.receipts))){
  const receipt=object(candidate);const recorded=object(receipt.stateReadback);
  if(receipt.method!=='deposit'||recorded.status!=='REFUNDABLE')continue;
  await inspect('refundable deposit '+String(recorded.id),async()=>{
    const deposit=await read('Bounties','get_deposit',[String(recorded.id)]);
    const credit=await read('Bounties','get_credit',['deposit-refund:'+String(recorded.id)]);
    check(deposit.finalized===true&&deposit.status==='REFUNDABLE'&&deposit.valid_ticket===false&&String(deposit.amount_wei)===String(recorded.amount_wei),'Original invalid-ticket deposit is not recorded as refundable for the same amount.');
    check(credit.finalized===true&&['AVAILABLE','PAID'].includes(String(credit.status))&&same(credit.owner,deposit.owner)&&String(credit.amount_wei)===String(deposit.amount_wei),'Original invalid-ticket refund is not reserved or paid to its depositor.');
  });
}
for (const candidate of Array.isArray(proof.cases) ? proof.cases : []) {
  const item = object(candidate); const id = String(item.id);
  await inspect(`case ${id}`, async () => {
    const watch = await read('Watches', 'get_watch', [String(item.watchId)]);
    check(watch.finalized === true && watch.historical_replay === true && same(watch.url, item.policyUrl) && watch.concern === item.concern, `${id}: finalized replay watch identity differs.`);
    if(item.kind==='WATCH_TIMEOUT'){
      const escrow=await read('Bounties','get_watch_escrow',[String(item.watchId)]);
      const credit=await read('Bounties','get_credit',['watch-refund:'+String(item.watchId)]);
      check(item.verdict==='VOID'&&watch.status==='CLOSED'&&Number(watch.expires_at)*1000<=Date.now()&&escrow.finalized===true&&escrow.status==='REFUNDED'&&String(escrow.amount_wei)==='0'&&credit.finalized===true&&['AVAILABLE','PAID'].includes(String(credit.status))&&same(credit.owner,watch.sponsor)&&String(credit.amount_wei)===String(escrow.refunded_wei),`${id}: expired watch refund is not finalized for its original sponsor and amount.`);
      return;
    }
    if (item.kind === 'COMPILE' || item.verdict === 'REJECTED') { check(['REJECTED','VOID'].includes(String(item.verdict)) && watch.status === item.verdict, `${id}: compiler terminal outcome is not present on-chain.`); return; }
    const baseline = object(item.baseline);
    check(watch.baseline_digest === baseline.digest && watch.baseline_url === baseline.url && watch.baseline_timestamp === baseline.timestamp, `${id}: frozen baseline differs from recorded evidence.`);
    if (baseline.excerpt) check(normalizedText(watch.baseline_text).includes(normalizedText(baseline.excerpt)), `${id}: displayed baseline excerpt is not present in the frozen source.`);
    const recordedCriteria = Array.isArray(item.criteria) ? item.criteria.map((criterion) => object(criterion).text) : [];
    check(JSON.stringify(watch.criteria) === JSON.stringify(recordedCriteria), `${id}: frozen criteria differ from the recorded case.`);
    const claim = await read('Claims', 'get_claim', [String(item.claimId)]);
    const upheld = object(item.challenge).ruling === 'UPHELD';
    check(claim.finalized === true && claim.watch_id === item.watchId && claim.passage === item.passage && same(claim.hunter, item.claimant), `${id}: finalized claim identity differs.`);
    if (item.verdict === 'NO_AGREEMENT') {
      const caseHashes = new Set(Object.values(object(item.transactions)));
      const receipt = Object.values(object(proof.receipts)).map(object).find(value => caseHashes.has(value.hash) && value.method === 'judge_claim' && value.stage === 'FINALIZED_ERROR') ?? {};
      check(receipt.stage === 'FINALIZED_ERROR' && receipt.failureDisposition === 'RETAINED_NOT_RETRIED' && receipt.consensus === 'MAJORITY_DISAGREE' && receipt.method === 'judge_claim' && !!receipt.failureReason, `${id}: no-agreement case lacks its retained failed judgment receipt.`);
      check(claim.status === 'READY' && !item.challenge && !object(item.payout).creditVerified, `${id}: failed judgment unexpectedly changed claim state or recorded a challenge or paid bounty.`);
    } else check(claim.status === (upheld ? 'VOID' : item.verdict), `${id}: recorded verdict does not match the current finalized claim.`);
    check(!upheld || claim.voided === true, `${id}: upheld claim is not voided.`);
    if(claim.status==='VOID'&&!upheld&&watch.status==='CLOSED'){
      const escrow=await read('Bounties','get_watch_escrow',[String(item.watchId)]);
      const credit=await read('Bounties','get_credit',['watch-refund:'+String(item.watchId)]);
      check(escrow.finalized===true&&escrow.status==='REFUNDED'&&String(escrow.amount_wei)==='0'&&credit.finalized===true&&['AVAILABLE','PAID'].includes(String(credit.status))&&same(credit.owner,watch.sponsor)&&String(credit.amount_wei)===String(escrow.refunded_wei),`${id}: original timeout escrow refund differs from its sponsor or amount.`);
    }
    if(upheld){
      const closure=await read('Challenges','get_claim_summary',[String(item.claimId)]);
      check(closure.finalized===true&&closure.sealed===true&&closure.pending===0&&closure.upheld===true,`${id}: upheld challenge window is not finalized and closed.`);
    }
    const results = Array.isArray(claim.results) ? claim.results.map(object) : [];
    for (const [index, candidate] of (Array.isArray(item.criteria) ? item.criteria : []).entries()) {
      const recorded = object(candidate);
      const actual = results.find(result => result.criterion_index === index);
      check(recorded.verdict === (actual?.verdict ?? 'NOT_RUN') && String(recorded.quote ?? '') === String(actual?.quote ?? ''), `${id}: criterion ${index + 1} verdict or quote differs from finalized state.`);
    }
    if(item.verdict==='NOT_TRIGGERED'){
      const bond=await read('Bounties','get_bond',[String(item.claimId)]);
      check(bond.finalized===true&&bond.status==='FORFEITED',`${id}: NOT_TRIGGERED bond forfeiture is not finalized.`);
    }
    if(item.sourceCaseId==='baseline-passage-rejected'||id==='baseline-passage-rejected'){
      const normalized=(value:unknown)=>String(value??'').replace(/\s+/g,' ').trim();
      check(item.verdict==='CODE_REJECTED'&&normalized(watch.baseline_text).includes(normalized(claim.passage))&&String(claim.reason).toLowerCase().includes('baseline'),`${id}: code rejection does not prove the passage already existed in the baseline.`);
      const bond=await read('Bounties','get_bond',[String(item.claimId)]);
      check(!Object.keys(bond).length,`${id}: code-rejected claim unexpectedly has a bond.`);
    }
    if (item.verdict !== 'CODE_REJECTED') {
      const later = object(item.later);
      check(claim.snapshot_digest === later.digest && claim.snapshot_url === later.url && claim.snapshot_timestamp === later.timestamp, `${id}: later capture differs from the finalized claim.`);
      if (later.excerpt) check(normalizedText(claim.snapshot_text).includes(normalizedText(later.excerpt)), `${id}: displayed later excerpt is not present in the frozen source.`);
    }
    const challenge = object(item.challenge);
    if (challenge.id) {
      const actual = await read('Challenges', 'get_challenge', [String(challenge.id)]);
      check(actual.finalized === true && ['RESOLVED','CODE_REJECTED','VOID'].includes(String(actual.status)) && actual.claim_id === item.claimId && (actual.ruling??actual.status) === challenge.ruling && actual.ground === challenge.ground, `${id}: challenge ruling differs from finalized state.`);
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
for(const candidate of Array.isArray(proof.liveWatchAttempts)?proof.liveWatchAttempts:[]){
  const item=object(candidate);const id=String(item.id);
  await inspect(`watch attempt ${id}`,async()=>{
    const watch=await read('Watches','get_watch',[id]);
    const escrow=await read('Bounties','get_watch_escrow',[id]);
    check(watch.finalized===true&&['VOID','REJECTED'].includes(String(watch.status))&&watch.status===item.status&&watch.reason===item.reason&&watch.concern===item.concern&&same(watch.url,item.policyUrl),`${id}: unfunded watch terminal result differs from finalized state.`);
    check(String(item.bountyDepositedWei)==='0'&&!Object.keys(escrow).length,`${id}: failed watch unexpectedly has a funded escrow.`);
  });
}
if (contracts.Bounties) await inspect('escrow accounting', async () => {
  const accounting = await read('Bounties', 'get_accounting');
  check(String(accounting.total_deposited_wei) === String(proof.depositedWei), 'Escrow total deposits differ from the transaction-level value journal.');
  check(BigInt(String(accounting.native_balance_wei)) >= BigInt(String(accounting.unpaid_liability_wei)), 'Escrow balance is below its unpaid liabilities.');
});
process.stdout.write(JSON.stringify({ ok: errors.length === 0, errors, requests, stateReads: cache.size }));
process.exitCode = errors.length ? 1 : 0;
