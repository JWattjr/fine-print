import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { getAddress, keccak256, type Hex } from 'viem';
import { studioSdkRequest } from '../lib/studio-transport';
import { transactionView } from '../lib/transactions';
import { updateLocalProof } from '../lib/local-proof';
import { compactReadback } from '../lib/studio-contracts';
import { readStudioTransaction } from '../lib/rpc-client';

export type Row = Record<string, any>;
export const object = (value: any): Row => value && typeof value === 'object' ? value : {};
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export function claimRefundCredit(claim:Row,challenge:Row):string|undefined {
  return ['UNCLEAR','VOID'].includes(claim.status)&&challenge.ruling!=='UPHELD'?'claim-refund:'+claim.id:undefined;
}
export async function proof(): Promise<Row> { return JSON.parse(await readFile('deploy/proof.json', 'utf8')); }
export async function atomic(path: string, value: unknown) {
  await writeFile(path + '.pending', JSON.stringify(value, (_, v) => typeof v === 'bigint' ? { integer: String(v) } : v, 2) + '\n', { mode: 0o600 });
  await rename(path + '.pending', path);
}
export class Runner {
  account: ReturnType<typeof createAccount>;
  client: ReturnType<typeof createClient>;
  contracts: Row;
  activeKey = '';
  depositDeadline = 0;
  readRetryDelayMs = 10000;
  secret: string;
  constructor(secret: Hex, contracts: Row) {
    this.secret = secret;
    this.account = createAccount(secret); this.contracts = contracts;
    // SDK 1.1.8's local-account write path waits for an EVM receipt on StudioNet.
    // Use its provider path with our dedicated local signer and StudioNet receipts.
    this.client = createClient({ chain: studionet, account: this.account.address, provider: { request: async ({ method, params = [] }: any) => {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [this.account.address];
      if (method !== 'eth_sendTransaction') throw new Error('Runner provider signs transactions only.');
      if (!this.activeKey) throw new Error('A durable action key is required before signing.');
      const path = this.wirePath(this.activeKey);
      const recovering=existsSync(path);
      let wire: Row;
      if (existsSync(path)) wire = JSON.parse(await readFile(path, 'utf8'));
      else {
        const tx = params[0];
        if (Number(BigInt(tx.chainId)) !== 61999 || String(tx.from).toLowerCase() !== this.account.address.toLowerCase()) throw new Error('Signer or network mismatch.');
        const raw = await this.account.signTransaction({ type: 'legacy', chainId: 61999, nonce: Number(BigInt(tx.nonce)), to: getAddress(tx.to), data: tx.data, value: BigInt(tx.value ?? 0), gas: BigInt(tx.gas), gasPrice: BigInt(tx.gasPrice ?? 0) });
        wire = { key: this.activeKey, raw, expectedHash: keccak256(raw), preparedAt: new Date().toISOString() };
        await atomic(path, wire); // Save the signed bytes before the first broadcast.
      }
      return this.broadcast(wire, path, recovering);
    } } });
  }
  wirePath(key: string) { return '.source-cache/runner/wire/' + key.replace(/[^\w-]/g, '_') + '.json'; }
  async reserveCapacity(count:number) {
    const path='.source-cache/runner/request-times.json';
    while(existsSync(path)){
      const times:number[]=JSON.parse(await readFile(path,'utf8'));
      const recent=times.filter(t=>Date.now()-t<3600000);
      if(recent.length+count<=440)return;
      const index=Math.min(recent.length-1,recent.length+count-440-1);
      const delay=Math.max(1000,recent[index]+3600000-Date.now()+1000);
      console.log(JSON.stringify({event:'reserve-case-request-budget',requestsReserved:count,until:new Date(Date.now()+delay).toISOString()}));
      await sleep(delay);
    }
  }
  address(name: string) { return getAddress(this.contracts[name].address); }
  async budget() {
    const path = '.source-cache/runner/request-times.json';
    let times: number[] = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : [];
    times = times.filter(t => Date.now() - t < 3600000);
    if (times.length >= 440) {
      const delay = Math.max(0, times[0] + 3600000 - Date.now() + 1000);
      console.log(JSON.stringify({ event: 'request-budget-wait', until: new Date(Date.now() + delay).toISOString() }));
      await sleep(delay); times = times.filter(t => Date.now() - t < 3600000);
    }
    await sleep(Math.max(0, (times.at(-1) ?? 0) + 2500 - Date.now()));
    times.push(Date.now()); await atomic(path, times);
    if(this.depositDeadline && Date.now()+60000>=this.depositDeadline)throw new Error('Deposit execution margin elapsed before broadcast. No new value transaction was sent.');
  }
  async rpc(method: string, params: unknown[] = []): Promise<any> {
    await this.budget();
    const response = await fetch('https://studio.genlayer.com/api', { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 FinePrintRunner/1.0', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(25000) });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(`RPC ${method}: ${String(result.error?.message ?? response.status).slice(0, 300)}`);
    return result.result;
  }
  async broadcast(wire: Row, path: string, recovering=true): Promise<Hex> {
    // Re-broadcasting identical signed bytes uses the same nonce and hash.
    if (wire.hash) return wire.hash;
    if(recovering){const known=await this.recoverSignedHash(wire,path);if(known)return known;}
    const hash = await this.rpc('eth_sendRawTransaction', [wire.raw]);
    wire.hash = hash; await atomic(path, wire);
    return hash;
  }
  async recoverSignedHash(wire:Row,path:string):Promise<Hex|undefined>{
    if(wire.hash)return wire.hash;
      try {
        const known=await this.tx(wire.expectedHash);
        if(known.hash.toLowerCase()!==String(wire.expectedHash).toLowerCase())throw new Error('Recovered signed transaction hash mismatch.');
        wire.hash=wire.expectedHash;await atomic(path,wire);return wire.hash;
      } catch(cause){
        if(!/not found|could not be found/i.test(cause instanceof Error?cause.message:String(cause)))throw cause;
      }
    return undefined;
  }
  async read(contract: string, method: string, args: any[] = []): Promise<Row> {
    const raw = await this.retryRead(() => studioSdkRequest(() => this.client.readContract({ address: this.address(contract), functionName: method, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL }), () => this.budget()),contract+'.'+method);
    return object(typeof raw === 'string' ? JSON.parse(raw) : raw);
  }
  async retryRead<T>(operation:()=>Promise<T>,label:string):Promise<T>{
    for(let attempt=0;;attempt++){
      try{return await operation();}
      catch(cause){
        const message=cause instanceof Error?cause.message:String(cause);
        if(attempt>=3||!/JSON|unexpected token|timeout|timed out|fetch|429|temporar|unknown RPC|not found|could not be found|ECONN/i.test(message))throw cause;
        console.log(JSON.stringify({event:'read-retry',label,attempt:attempt+1}));await sleep(this.readRetryDelayMs);
      }
    }
  }
  async tx(hash: string) { return transactionView(await this.retryRead(()=>readStudioTransaction(hash,()=>this.budget()),'receipt:'+hash)); }
  async waitState(contract: string, method: string, args: any[], predicate: (row: Row) => boolean, deadline = Date.now() + 1800000): Promise<Row> {
    while (Date.now() < deadline) {
      const row = await this.read(contract, method, args);
      if (predicate(row)) return row;
      await sleep(10000);
    }
    throw new Error(`Finalized state deadline: ${contract}.${method}. Resume with saved hashes; no new transaction was submitted.`);
  }
  async save(key: string, record: Row) {
    await updateLocalProof(p => {
      const receipts = (p.receipts ??= {}) as Row; const transactions = (p.transactions ??= {}) as Row;
      if (transactions[key] && transactions[key] !== record.hash) throw new Error('One-time action hash conflict.');
      receipts[key] = { ...object(receipts[key]), ...record, key, recordedAt: new Date().toISOString() }; transactions[key] = record.hash;
      if (record.method==='deposit' && BigInt(record.valueWei ?? 0) > 0n) {
        const transfers = (p.valueTransfers ??= []) as Row[];
        let transfer = transfers.find(t => t.hash === record.hash);
        if (!transfer) { transfer = { label: key, hash: record.hash, amountWei: record.valueWei, purpose: 'Bounties.deposit' }; transfers.push(transfer); }
        Object.assign(transfer, { stage: record.stage, valueCredited: record.valueCredited });
        p.depositedWei = transfers.reduce((n, t) => n + (String(t.stage).startsWith('FINALIZED') && t.valueCredited === false ? 0n : BigInt(t.amountWei)), 0n).toString();
      }
    });
  }
  async step(key: string, contract: string, method: string, args: any[], readMethod: string, readArgs: any[], predicate: (row: Row) => boolean, value = 0n, historicalReplay = true): Promise<Row> {
    let record = object((await proof()).receipts?.[key]);
    if(record.stage==='FINALIZED_SUCCESS'&&record.stateVerified===true) return object(record.stateReadback);
    if (!record.hash) {
      const path = this.wirePath(key);
      const wire=existsSync(path)?JSON.parse(await readFile(path,'utf8')):undefined;
      const recoveredHash=wire?await this.recoverSignedHash(wire,path):undefined;
      if (value && !recoveredHash) {
        if(contract!=='Bounties'||method!=='deposit')throw new Error('Only reviewed Bounties deposits may attach value.');
        const accounting = await this.read('Bounties', 'get_accounting');
        const local = BigInt((await proof()).depositedWei);
        if (BigInt(accounting.total_deposited_wei) + value > 1110n || local + value > 1110n) throw new Error('Owner-approved 1,110-wei deposit cap would be exceeded.');
        const balance = BigInt(await this.rpc('eth_getBalance', [this.account.address, 'latest']));
        if (balance < value) throw new Error('Dedicated account needs its approved funding transfer.');
        const ticket=await this.read('Bounties','get_ticket',[args[1]]);
        if(ticket.status!=='READY'||ticket.finalized!==true||ticket.owner!==this.account.address.toLowerCase()||ticket.amount_wei!==String(value)||Number(ticket.expires_at)*1000-Date.now()<90000)throw new Error('Deposit ticket owner, value, finality or execution margin failed. No value sent.');
        this.depositDeadline=Number(ticket.expires_at)*1000;
      }
      this.activeKey = key;
      let hash: Hex;
      try {
        hash = recoveredHash ?? (wire ? await this.broadcast(wire,path,false) : await studioSdkRequest(() => this.client.writeContract({ address: this.address(contract), functionName: method, args, value }), () => this.budget()));
      } finally { this.activeKey = ''; this.depositDeadline=0; }
      record = { key, hash, label: method, contract, method, args: args.map(v => typeof v === 'bigint' ? { integer: String(v) } : v), valueWei: String(value), historicalReplay, account: this.account.address.toLowerCase(), submittedAt: new Date().toISOString(), stage: 'SUBMITTED', status: 'SUBMITTED', stateVerified: false, readback: { contract, method: readMethod, args: readArgs } };
      await this.save(key, record); // Hash is durable before any finality polling.
      console.log(JSON.stringify({ event: 'submitted', key, hash }));
    }
    if (record.stage === 'FINALIZED_ERROR') throw new Error(`${key} already finalized with an error; preserving this outcome without rerunning.`);
    while (!String(record.stage).startsWith('FINALIZED')) {
      const tx = await this.tx(record.hash);
      record = { ...record, ...tx }; await this.save(key, record);
      if (tx.stage === 'FINALIZED_ERROR') throw new Error(`${key} finalized with ${tx.execution}; no rerun.`);
      if (tx.stage !== 'FINALIZED_SUCCESS') await sleep(10000);
    }
    const state = await this.waitState(contract, readMethod, readArgs, predicate);
    await this.save(key, { ...record, stateVerified: true, stateReadback: compactReadback(state), readAt: new Date().toISOString(), readError: '' });
    console.log(JSON.stringify({ event: 'finalized', key, hash: record.hash, status: state.status ?? state.ruling ?? state.sealed }));
    return state;
  }
}

export async function createRunner(): Promise<Runner> {
  await mkdir('.source-cache/runner/wire', { recursive: true });
  const env = await readFile('.env', 'utf8');
  const key = env.match(/^FINE_PRINT_TEST_PRIVATE_KEY=(0x[\da-fA-F]{64})$/m)?.[1] as Hex | undefined;
  if (!key) throw new Error('Run scripts/init-test-account.ts first. Never pass a key on the command line.');
  try { return new Runner(key, (await proof()).contracts); }
  catch { throw new Error('The dedicated account could not be initialized. Its key was not logged.'); }
}
