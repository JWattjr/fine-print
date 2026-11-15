import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Hex } from 'viem';
import { createRunner, proof, object, sleep, type Row } from './runner-runtime';
import { updateLocalProof } from '../lib/local-proof';
import { studioSdkRequest } from '../lib/studio-transport';

const files: Row = { Watches: 'watches.py', Claims: 'claims.py', Challenges: 'challenges.py', Bounties: 'bounties.py', ChangeLedger: 'change_ledger.py' };
const r = await createRunner();
if (Number(BigInt(await r.rpc('eth_chainId'))) !== 61999) throw new Error('StudioNet only.');
const names = Object.keys(files);
const addr = async (n: string) => String(object((await proof()).contracts[n]).address ?? '');
for (const name of names) {
  const key = 'deploy-' + name;
  let rec = object((await proof()).receipts?.[key]);
  if (!rec.hash) {
    const code = await readFile('contracts/' + files[name], 'utf8');
    r.activeKey = key;
    let hash: Hex;
    try { hash = await studioSdkRequest(() => r.client.deployContract({ code, args: [] }), () => r.budget()) as Hex; } finally { r.activeKey = ''; }
    rec = { key, hash, label: 'Deploy ' + name, account: r.account.address.toLowerCase(), contract: name, method: 'deploy', args: [], valueWei: '0', historicalReplay: false, submittedAt: new Date().toISOString(), stage: 'SUBMITTED', status: 'SUBMITTED', sourceSha256: createHash('sha256').update(code).digest('hex') };
    await r.save(key, rec); console.log(JSON.stringify({ event: 'submitted', key, hash }));
  }
  while (!String(rec.stage).startsWith('FINALIZED')) {
    const tx = await r.tx(rec.hash); rec = { ...rec, ...tx }; await r.save(key, rec);
    if (tx.stage === 'FINALIZED_ERROR') throw new Error(key + ' finalized with an error; stopping.');
    if (!String(tx.stage).startsWith('FINALIZED')) await sleep(10000);
  }
  const address = rec.contractAddress; if (!/^0x[\da-fA-F]{40}$/.test(address)) throw new Error('No contract address in the finalized deploy receipt.');
  await updateLocalProof(p => { (p.contracts as Row)[name] = { address: address.toLowerCase(), explorer: 'https://explorer-studio.genlayer.com/address/' + address.toLowerCase(), sourceSha256: rec.sourceSha256, transactionHash: rec.hash }; });
  r.contracts = (await proof()).contracts;
  console.log(JSON.stringify({ event: 'deployed', name, address }));
}
const a: Row = Object.fromEntries(await Promise.all(names.map(async n => [n, await addr(n)])));
const peers: Row = { Watches: [a.Bounties], Claims: [a.Watches, a.Bounties, a.Challenges, a.ChangeLedger], Challenges: [a.Watches, a.Claims, a.Bounties, a.ChangeLedger], Bounties: [a.Watches, a.Claims, a.Challenges, a.ChangeLedger], ChangeLedger: [a.Watches, a.Claims, a.Challenges, a.Bounties] };
for (const name of names) {
  await r.step('configure-' + name, name, 'configure', peers[name], 'get_config', [], row => row.configured === true);
  console.log(JSON.stringify({ event: 'configured', name }));
}
await writeFile('deploy/contracts.json', JSON.stringify((await proof()).contracts, null, 2));
console.log(JSON.stringify({ event: 'done', contracts: a }));
