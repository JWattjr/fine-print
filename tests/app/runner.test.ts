import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { Runner, claimRefundCredit } from '../../scripts/runner-runtime';
import { spawn } from 'node:child_process';
async function removeTestDir(dir:string){
  const absolute=resolve(dir);const rel=relative(resolve(tmpdir()),absolute);
  assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&basename(absolute).startsWith('fineprint-'));
  await rm(absolute,{recursive:true,force:true});
}

test('an upheld challenge does not also refund the awarded hunter bond',()=>{
  assert.equal(claimRefundCredit({id:'claim',status:'VOID'},{ruling:'UPHELD'}),undefined);
  assert.equal(claimRefundCredit({id:'claim',status:'VOID'},{}),'claim-refund:claim');
  assert.equal(claimRefundCredit({id:'claim',status:'UNCLEAR'},{}),'claim-refund:claim');
  assert.equal(claimRefundCredit({id:'claim',status:'TRIGGERED'},{}),undefined);
});

test('transient malformed RPC reads retry without submitting a transaction',async()=>{
  const runner=new Runner(('0x'+'01'.repeat(32)) as `0x${string}`,{});runner.readRetryDelayMs=0;
  let reads=0;
  const value=await runner.retryRead(async()=>{reads++;if(reads<3)throw new Error('Unexpected token in JSON response');return 'finalized';},'mock receipt');
  assert.equal(value,'finalized');assert.equal(reads,3);
});

test('proof journal serializes independent process writers without losing records',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fineprint-writers-'));
  try {
    await mkdir(join(dir,'deploy'));await writeFile(join(dir,'deploy/proof.json'),JSON.stringify({counter:0}));
    const moduleUrl=new URL('../../lib/local-proof.ts',import.meta.url).href;
    const source=`const {updateLocalProof}=await import(${JSON.stringify(moduleUrl)}); for(let i=0;i<20;i++)await updateLocalProof(async proof=>{const n=Number(proof.counter);await new Promise(r=>setTimeout(r,2));proof.counter=n+1;});`;
    const run=()=>new Promise<void>((resolve,reject)=>{
      const child=spawn(process.execPath,['--import',new URL('../../node_modules/tsx/dist/loader.mjs',import.meta.url).href,'--input-type=module','-e',source],{cwd:dir,stdio:['ignore','ignore','pipe']});
      let error='';child.stderr.on('data',chunk=>{error+=String(chunk);});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(error)));
    });
    const results=await Promise.allSettled([run(),run()]);
    for(const result of results)assert.equal(result.status,'fulfilled',result.status==='rejected'?String(result.reason):'');
    assert.equal(JSON.parse(await readFile(join(dir,'deploy/proof.json'),'utf8')).counter,40);
  } finally {await removeTestDir(dir);}
});

test('runner saves a submitted hash before polling and resumes without a second write', async () => {
  const original=process.cwd();const dir=await mkdtemp(join(tmpdir(),'fineprint-runner-'));
  try {
    process.chdir(dir);await mkdir('deploy');await writeFile('deploy/proof.json',JSON.stringify({receipts:{},transactions:{},depositedWei:'601'}));
    const runner=new Runner(('0x'+'01'.repeat(32)) as `0x${string}`,{Watches:{address:'0x'+'11'.repeat(20)}});
    const hash=('0x'+'22'.repeat(32)) as `0x${string}`;
    let writes=0;
    Object.defineProperty(runner.client,'writeContract',{value:async()=>{writes++;return hash;}});
    runner.tx=async()=>{
      const saved=JSON.parse(await readFile('deploy/proof.json','utf8'));
      assert.equal(saved.receipts['script:test:compile'].hash,hash);
      return {hash,status:'FINALIZED',stage:'FINALIZED_SUCCESS',execution:'FINISHED_WITH_RETURN',consensus:'MAJORITY_AGREE'};
    };
    runner.waitState=async()=>({status:'COMPILED',finalized:true});
    await runner.step('script:test:compile','Watches','compile_watch',[],'get_watch',['id'],()=>true);
    await runner.step('script:test:compile','Watches','compile_watch',[],'get_watch',['id'],()=>true);
    assert.equal(writes,1);
  } finally {process.chdir(original);await removeTestDir(dir);}
});

test('runner blocks a deposit that would exceed the owner cap', async () => {
  const original=process.cwd();const dir=await mkdtemp(join(tmpdir(),'fineprint-cap-'));
  try {
    process.chdir(dir);await mkdir('deploy');await writeFile('deploy/proof.json',JSON.stringify({receipts:{},transactions:{},depositedWei:'1105'}));
    const runner=new Runner(('0x'+'01'.repeat(32)) as `0x${string}`,{});
    runner.read=async()=>({total_deposited_wei:'1105'});
    await assert.rejects(runner.step('script:test:deposit','Bounties','deposit',[],'get_deposit',['id'],()=>true,10n),/cap would be exceeded/);
    assert.deepEqual(JSON.parse(await readFile('deploy/proof.json','utf8')).transactions,{});
  } finally {process.chdir(original);await removeTestDir(dir);}
});

test('runner adopts an already broadcast deposit before checking funds again',async()=>{
  const original=process.cwd();const dir=await mkdtemp(join(tmpdir(),'fineprint-broadcast-'));
  try {
    process.chdir(dir);await mkdir('deploy');await mkdir('.source-cache/runner/wire',{recursive:true});
    await writeFile('deploy/proof.json',JSON.stringify({receipts:{},transactions:{},depositedWei:'1100',valueTransfers:[{hash:'0x'+'44'.repeat(32),amountWei:'1100',stage:'FINALIZED_SUCCESS',valueCredited:true}]}));
    const runner=new Runner(('0x'+'01'.repeat(32)) as `0x${string}`,{});
    const hash=('0x'+'55'.repeat(32)) as `0x${string}`;
    await writeFile(runner.wirePath('script:test:deposit'),JSON.stringify({hash,expectedHash:hash}));
    runner.read=async()=>{throw new Error('An already broadcast deposit must not be funded again.');};
    runner.tx=async()=>({hash,status:'FINALIZED',stage:'FINALIZED_SUCCESS',execution:'FINISHED_WITH_RETURN',consensus:'MAJORITY_AGREE',valueCredited:true,valueWei:'10'});
    runner.waitState=async()=>({status:'ALLOCATED',finalized:true,valid_ticket:true});
    await runner.step('script:test:deposit','Bounties','deposit',['d','t'],'get_deposit',['d'],()=>true,10n);
    const saved=JSON.parse(await readFile('deploy/proof.json','utf8'));
    assert.equal(saved.depositedWei,'1110');assert.equal(saved.receipts['script:test:deposit'].hash,hash);
  } finally {process.chdir(original);await removeTestDir(dir);}
});

test('runner refuses an almost expired ticket before signing value',async()=>{
  const original=process.cwd();const dir=await mkdtemp(join(tmpdir(),'fineprint-ticket-'));
  try {
    process.chdir(dir);await mkdir('deploy');await writeFile('deploy/proof.json',JSON.stringify({receipts:{},transactions:{},depositedWei:'0'}));
    const runner=new Runner(('0x'+'01'.repeat(32)) as `0x${string}`,{});
    runner.read=async(_contract,method)=>method==='get_accounting'?{total_deposited_wei:'0'}:{status:'READY',finalized:true,owner:runner.account.address.toLowerCase(),amount_wei:'10',expires_at:Math.floor(Date.now()/1000)+10};
    runner.rpc=async()=> '0x3e8';
    await assert.rejects(runner.step('script:test:deposit','Bounties','deposit',['d','t'],'get_deposit',['d'],()=>true,10n),/execution margin failed/);
    assert.deepEqual(JSON.parse(await readFile('deploy/proof.json','utf8')).transactions,{});
  } finally {process.chdir(original);await removeTestDir(dir);}
});

test('runner preserves a finalized execution error without resubmitting', async () => {
  const original=process.cwd();const dir=await mkdtemp(join(tmpdir(),'fineprint-error-'));
  try {
    process.chdir(dir);await mkdir('deploy');await writeFile('deploy/proof.json',JSON.stringify({receipts:{failed:{hash:'0x'+'33'.repeat(32),stage:'FINALIZED_ERROR'}}}));
    const runner=new Runner(('0x'+'01'.repeat(32)) as `0x${string}`,{});
    await assert.rejects(runner.step('failed','Claims','judge_claim',[],'get_claim',['id'],()=>true),/preserving this outcome without rerunning/);
  } finally {process.chdir(original);await removeTestDir(dir);}
});
