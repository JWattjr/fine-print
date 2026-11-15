import { readFile, writeFile, open, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRunner, proof, object, sleep, atomic, claimRefundCredit, type Row } from './runner-runtime';
import { updateLocalProof } from '../lib/local-proof';
import { compactReadback, contextExcerpt } from '../lib/studio-contracts';

const planPath = 'deploy/runner-plan.json';
const command = process.argv[2] ?? 'status';
const r = await createRunner();
const final = (row: Row) => row.finalized === true;
const terminal = (row: Row) => final(row) && ['TRIGGERED','NOT_TRIGGERED','UNCLEAR','VOID','CODE_REJECTED'].includes(row.status);
const end = (row: Row) => final(row) && !String(row.status).startsWith('PENDING');
let currentCase = '';
const chain = Number(BigInt(await r.rpc('eth_chainId')));
if (chain !== 61999) throw new Error('Only StudioNet 61999 is authorized.');
const lockPath = '.source-cache/runner/process.lock';
if (existsSync(lockPath)) {
  const old = JSON.parse(await readFile(lockPath, 'utf8'));
  let alive = true; try { process.kill(old.pid, 0); } catch { alive = false; }
  if (alive) throw new Error('Another runner is active. Resume it instead of starting a second writer.');
  await unlink(lockPath);
}
await writeFile(lockPath, JSON.stringify({ pid: process.pid }), { flag: 'wx' });

async function preparePlan() {
  if (existsSync(planPath)) return JSON.parse(await readFile(planPath, 'utf8'));
  const originals = JSON.parse(await readFile('deploy/case-plan.json', 'utf8')).cases as Row[];
  const find = (id: string) => originals.find(p => p.id === id)!;
  const watch = await r.read('Watches','get_watch',['rw_challenge-rejected']);
  const claim = await r.read('Claims','get_claim',['rc_challenge-rejected']);
  const baseline = String(watch.baseline_text).replace(/\s+/g,' ').trim();
  const later = String(claim.snapshot_text).replace(/\s+/g,' ').trim();
  const common = baseline.split(/(?<=[.!?])\s+/).find(s => s.length >= 50 && s.length <= 500 && later.includes(s));
  if (!common) throw new Error('No exact shared baseline passage was found.');
  const make = (id: string, recovery = false) => ({ ...find(id), id: recovery ? id + '-timing-recovery' : id, sourceCaseId: id, bountyWei:'10', challengeSeconds: 900, watchId:'sw_' + (recovery ? id + '-timing-recovery' : id), claimId:'sc_' + (recovery ? id + '-timing-recovery' : id), challengeId:'sh_' + (recovery ? id + '-timing-recovery' : id), ...(recovery ? { runLabel:'re-run after a timing failure' } : {}) });
  const cosmetic = { ...make('cosmetic-date-only',true), watchId:'sw_shared_zoom_setup', reuseWatch:true };
  const setup = { ...cosmetic, reuseWatch:false };
  const code = { ...make('baseline-passage-rejected'), watchId:setup.watchId, claimId:'sc_baseline-passage-rejected', reuseWatch:true, setup, concern:watch.concern, baseline:{url:watch.baseline_url,timestamp:watch.baseline_timestamp,original:watch.url,digest:watch.baseline_digest}, later:find('challenge-rejected').later, passage:common, targetOutcome:'CODE_REJECTED; no LLM judgment and no claim bond' };
  const plan = { account:r.account.address, chainId:61999, depositCapWei:'1110', cases:[code,cosmetic,make('injection-ignored'),make('challenge-upheld',true),make('challenge-rejected',true)], liveWatches:[
    {id:'live_x_script',company:'X',url:'https://twitter.com/en/privacy',concern:'Tell me if X permits the contents of private direct messages to be used to train artificial intelligence or machine learning models without an explicit opt-in from the sender.',bountyWei:'100'},
    {id:'live_adobe_script',company:'Adobe',url:'https://www.adobe.com/legal/terms.html',concern:'Tell me if Adobe permits uploaded cloud content to be used to train generative artificial intelligence models without separate explicit consent from the user.',bountyWei:'100'}
  ], createdAt:new Date().toISOString() };
  await atomic(planPath,plan); return plan;
}
async function fund(prefix: string, kind: string, id: string, amount: string, historical = true) {
  const ticket = 'st_' + id; const deposit = 'sd_' + id;
  if(!(await proof()).receipts?.[prefix+':ticket'])await r.reserveCapacity(60);
  let t = await r.step(prefix+':ticket','Bounties','prepare_deposit',[ticket,kind,id],'get_ticket',[ticket],row=>final(row)&&row.status==='READY',0n,historical);
  const prior = object((await proof()).receipts?.[prefix+':deposit']);
  if(!prior.hash)t=await r.read('Bounties','get_ticket',[ticket]);
  if (!prior.hash && (t.owner !== r.account.address.toLowerCase() || t.amount_wei !== amount || Number(t.expires_at)*1000-Date.now()<90000)) throw new Error('Funding ticket identity, exact amount or 90-second execution margin failed. No deposit sent.');
  const d = await r.step(prefix+':deposit','Bounties','deposit',[deposit,ticket],'get_deposit',[deposit],final,BigInt(amount),historical);
  if (!d.valid_ticket || d.status!=='ALLOCATED') throw new Error('Deposit did not allocate; actual refundable outcome is preserved.');
  await r.waitState('Bounties',kind==='WATCH'?'get_watch_escrow':'get_bond',[id],row=>final(row)&&['FUNDED','ALLOCATED','FORFEITED','AWARDED','REFUNDED'].includes(row.status));
}
async function pull(prefix: string, creditId: string) {
  let credit = await r.waitState('Bounties','get_credit',[creditId],row=>['AVAILABLE','TRANSFER_PENDING','VERIFYING','PAID'].includes(row.status));
  if (credit.status==='PAID') return credit;
  const attempt = credit.status==='AVAILABLE'?Number(credit.attempt)+1:Number(credit.attempt);
  credit = await r.step(prefix+':pull','Bounties','claim',[creditId,attempt],'get_credit',[creditId],row=>Number(row.attempt)===attempt&&['TRANSFER_PENDING','VERIFYING','PAID','AVAILABLE'].includes(row.status));
  const parentHash = (await proof()).receipts[prefix+':pull'].hash;
  let parent = await r.tx(parentHash);
  while (!parent.triggeredTransactions?.length) { await sleep(10000); parent=await r.tx(parentHash); }
  if (parent.triggeredTransactions.length!==1) throw new Error('Native payout has an ambiguous child; no verification submitted.');
  const childHash=parent.triggeredTransactions[0]; let child=await r.tx(childHash);
  while(child.status!=='FINALIZED') { await sleep(10000); child=await r.tx(childHash); }
  if(child.triggeredBy?.toLowerCase()!==parentHash.toLowerCase()||child.from?.toLowerCase()!==r.address('Bounties').toLowerCase()||child.to?.toLowerCase()!==r.account.address.toLowerCase()||child.valueWei!==String(credit.amount_wei)) throw new Error('Native payout linkage, amount or owner mismatch.');
  await r.save(prefix+':native-child',{...child,key:prefix+':native-child',label:'Linked native transfer',contract:'Bounties',method:'native_transfer',args:[creditId],account:r.account.address.toLowerCase(),historicalReplay:true,submittedAt:new Date().toISOString(),stateVerified:true,stateReadback:{parent:parentHash,creditId,nativeCreditVerified:child.valueCredited}});
  const result=await r.step(prefix+':verify','Bounties','verify_claim',[creditId,attempt,parentHash,childHash],'get_credit',[creditId],row=>final(row)&&['PAID','AVAILABLE'].includes(row.status));
  if(result.status!=='PAID') throw new Error('Native transfer was not credited; refundable credit restored. No automatic second pull.');
  return result;
}
async function record(p:Row, watch:Row, claim:Row={}, challenge:Row={}) {
  const closure = claim.id ? await r.read('Challenges','get_claim_summary',[claim.id]) : {};
  const settlement = claim.id ? await r.read('Bounties','get_settlement',[claim.id]) : {};
  const bond=claim.id?await r.read('Bounties','get_bond',[claim.id]):{};
  const escrow=await r.read('Bounties','get_watch_escrow',[watch.id]);
  const results=(claim.results??[]) as Row[];
  const receipts=(await proof()).receipts;
  const transactions=Object.fromEntries(Object.entries<Row>(receipts).filter(([key,row])=>key.startsWith('script:'+p.id+':')||(p.original&&(key.startsWith('replay:'+p.id+':')||(row.args??[]).includes(watch.id)||(claim.id&&(row.args??[]).includes(claim.id))))).map(([key,row])=>[key,row.hash]));
  const row={ id:p.id, sourceCaseId:p.sourceCaseId??p.id, runLabel:p.runLabel, company:String(watch.url).includes('zoom.us')?'Zoom':String(watch.url).includes('adobe.com')?'Adobe':'X', policyUrl:watch.url, concern:watch.concern, watchId:watch.id, ...(claim.id?{claimId:claim.id}:{}), kind:p.watchTimeout?'WATCH_TIMEOUT':claim.id?'CLAIM':'COMPILE', criteria:(watch.criteria??[]).map((text:string,index:number)=>({text,verdict:results.find(v=>v.criterion_index===index)?.verdict??'NOT_RUN',quote:results.find(v=>v.criterion_index===index)?.quote})), baseline:{url:watch.baseline_url??'',timestamp:watch.baseline_timestamp??'',digest:watch.baseline_digest??'',excerpt:contextExcerpt(String(watch.baseline_text??''),claim.passage)}, later:{url:claim.snapshot_url??'',timestamp:claim.snapshot_timestamp??'',digest:claim.snapshot_digest??'',excerpt:contextExcerpt(String(claim.snapshot_text??''),claim.passage)}, passage:claim.passage??'', verdict:p.watchTimeout?'VOID':claim.status??watch.status, explanation:String(claim.reason??watch.reason??'')+(p.runLabel?' '+p.runLabel+'.':''), bountyWei:watch.bounty_wei,claimant:claim.hunter??watch.sponsor,historicalReplay:true,status:'FINALIZED_SUCCESS',finalized:true,stateVerified:true,transactions,
    stateReadback:compactReadback({watch,claim,challenge,closure,settlement,bond,escrow}),
    ...(Number(claim.challenge_deadline)>0?{challengeWindow:{deadline:new Date(Number(claim.challenge_deadline)*1000).toISOString(),closed:closure.finalized===true&&closure.sealed===true&&closure.pending===0}}:{}),
    ...(challenge.id?{challenge:{id:challenge.id,ground:challenge.ground,evidence:challenge.baseline_passage||challenge.argument,challenger:challenge.challenger,ruling:challenge.ruling??challenge.status,transactionHash:transactions['script:'+p.id+':challenge-judge']}}:{}),
    ...(settlement.status==='PAID'&&settlement.credit_verified===true?{payout:{amountWei:settlement.amount_wei,recipient:settlement.recipient,transactionHash:settlement.child,creditVerified:true}}:{}) };
  if(p.watchTimeout)row.explanation='The original funded watch expired before a claim was submitted. Its escrow was reserved for refund to the original sponsor. This case ended without a validator claim judgment; VOID describes the abandoned case workflow.';
  await updateLocalProof(proof=>{const rows=(proof.cases??=[]) as Row[];const index=rows.findIndex(v=>v.id===p.id);if(index>=0&&(rows[index].watchId!==row.watchId||rows[index].claimId!==row.claimId))throw new Error('A recorded case cannot be replaced with different on-chain IDs.');if(index<0)rows.push(row);else rows[index]=row;proof.recordedAt=new Date().toISOString();});
  console.log(JSON.stringify({event:'case-recorded',id:p.id,verdict:row.verdict,challenge:challenge.ruling,paid:!!row.payout}));
}
async function runCase(p: Row) {
  currentCase=p.id;const key='script:'+p.id;
  let watch:Row;
  if(p.setup) {
    const s=p.setup; const setupKey='script:'+s.id;
    const compiled=await r.step(setupKey+':compile','Watches','compile_watch',[s.watchId,s.baseline.original,s.concern,BigInt(s.bountyWei),86400,s.challengeSeconds??900,s.baseline.timestamp],'get_watch',[s.watchId],end);
    if(!['COMPILED','OPEN'].includes(compiled.status))throw new Error('Shared cosmetic setup compiled to '+compiled.status+'; no rerun.');
    await fund(setupKey+':watch','WATCH',s.watchId,s.bountyWei);
    await r.waitState('Watches','get_watch',[s.watchId],row=>final(row)&&['OPEN','CLOSED'].includes(row.status));
  }
  if(p.reuseWatch) {
    watch=await r.read('Watches','get_watch',[p.watchId]);
    const old=p.cleanupClaim?await r.read('Claims','get_claim',[p.cleanupClaim]):{};
    if(old.status==='READY'&&Number(old.prepare_deadline)*1000<Date.now()) {
      const expired=await r.step(key+':cleanup','Claims','timeout_claim',[old.id],'get_claim',[old.id],row=>final(row)&&row.status==='VOID');
      const original=JSON.parse(await readFile('deploy/case-plan.json','utf8')).cases.find((v:Row)=>v.id==='challenge-rejected');
      await record({...original,watchId:watch.id,id:'challenge-rejected'},watch,expired);
    }
  } else {
    watch=await r.step(key+':compile','Watches','compile_watch',[p.watchId,p.baseline.original,p.concern,BigInt(p.bountyWei),86400,p.challengeSeconds??900,p.baseline.timestamp],'get_watch',[p.watchId],end);
    if(!['COMPILED','OPEN'].includes(watch.status)){await record(p,watch);return;}
    await fund(key+':watch','WATCH',p.watchId,p.bountyWei);
    watch=await r.waitState('Watches','get_watch',[p.watchId],row=>final(row)&&['OPEN','CLOSED'].includes(row.status));
  }
  if(!(await proof()).receipts?.[key+':prepare'])await r.reserveCapacity(p.challenge?200:110);
  let claim=await r.step(key+':prepare','Claims','prepare_claim',[p.claimId,p.watchId,p.later.url,p.passage],'get_claim',[p.claimId],row=>final(row)&&['READY','CODE_REJECTED','VOID'].includes(row.status));
  if(p.sourceCaseId==='baseline-passage-rejected'&&claim.status==='READY')throw new Error('Code rejection unexpectedly prepared READY. No LLM judgment or bond deposit will be submitted.');
  if(claim.status!=='READY'){await record(p,watch,claim);return;}
  await fund(key+':hunter','CLAIM',p.claimId,'1');
  claim=await r.step(key+':judge','Claims','judge_claim',[p.claimId],'get_claim',[p.claimId],terminal);
  let challenge:Row={};
  if(claim.status==='TRIGGERED'&&p.challenge){
    challenge=await r.step(key+':challenge-prepare','Challenges','prepare_challenge',[p.challengeId,p.claimId,p.challenge.ground,p.challenge.baselinePassage,p.challenge.argument],'get_challenge',[p.challengeId],row=>final(row)&&['READY','CODE_REJECTED','VOID'].includes(row.status));
    if(challenge.status==='READY'){
      await fund(key+':challenger','CHALLENGE',p.challengeId,'1');
      challenge=await r.step(key+':challenge-judge','Challenges','judge_challenge',[p.challengeId],'get_challenge',[p.challengeId],row=>final(row)&&row.status==='RESOLVED');
      await r.waitState('Bounties','get_bond',[p.challengeId],row=>final(row)&&row.status==='ALLOCATED');
      await pull(key+':challenge-award','challenge-award:'+p.challengeId);
    }
  }
  if(challenge.ruling==='UPHELD')claim=await r.waitState('Claims','get_claim',[p.claimId],row=>final(row)&&row.voided===true);
  await record(p,watch,claim,challenge); // Durable actual verdict even while closure waits.
  if(claim.status==='TRIGGERED'&&challenge.ruling!=='UPHELD'){
    const delay=Math.max(0,Number(claim.challenge_deadline)*1000-Date.now()+2000);
    if(delay){console.log(JSON.stringify({event:'challenge-window-wait',case:p.id,until:new Date(Date.now()+delay).toISOString()}));await sleep(delay);}
    await r.step(key+':seal','Challenges','seal_claim',[p.claimId],'get_claim_summary',[p.claimId],row=>final(row)&&row.sealed===true&&row.pending===0);
    await r.step(key+':settle','Bounties','settle',[p.claimId],'get_settlement',[p.claimId],row=>row.status==='AWAITING_PULL'||row.status==='PAID');
    await pull(key+':bounty','bounty:'+p.claimId);
    await pull(key+':hunter-refund','hunter-bond:'+p.claimId);
  } else if(claimRefundCredit(claim,challenge)){
    await pull(key+':refund',claimRefundCredit(claim,challenge)!);
  } else if(claim.status==='NOT_TRIGGERED'){
    await r.waitState('Bounties','get_bond',[p.claimId],row=>row.status==='FORFEITED');
  }
  claim=await r.read('Claims','get_claim',[p.claimId]);
  await record(p,watch,claim,challenge);
}
async function runLive(p:Row) {
  currentCase=p.id;const key='script:'+p.id;
  const watch=await r.step(key+':compile','Watches','compile_watch',[p.id,p.url,p.concern,BigInt(p.bountyWei),30*86400,3600,''],'get_watch',[p.id],end,0n,false);
  if(!['COMPILED','OPEN'].includes(watch.status)){
    if(!['VOID','REJECTED'].includes(watch.status))throw new Error('Current watch compiled to '+watch.status+'; actual result preserved.');
    await updateLocalProof(proof=>{
      const attempts=(proof.liveWatchAttempts??=[]) as Row[];
      const row={id:p.id,company:p.company,policyUrl:p.url,concern:p.concern,status:watch.status,reason:watch.reason,finalized:true,stateVerified:true,stateReadback:compactReadback(watch),transactionHash:object(proof.receipts)[key+':compile'].hash,bountyDepositedWei:'0'};
      const index=attempts.findIndex(v=>v.id===p.id);if(index<0)attempts.push(row);else attempts[index]=row;
    });
    console.log(JSON.stringify({event:'live-watch-terminal',id:p.id,status:watch.status,depositWei:'0'}));
    return;
  }
  await fund(key+':watch','WATCH',p.id,p.bountyWei,false);
  const live=await r.waitState('Watches','get_watch',[p.id],row=>final(row)&&row.status==='OPEN');
  const escrow=await r.read('Bounties','get_watch_escrow',[p.id]);
  const transactions=Object.fromEntries(Object.entries<Row>((await proof()).receipts).filter(([k])=>k.startsWith(key+':')).map(([k,row])=>[k,row.hash]));
  await updateLocalProof(proof=>{const rows=(proof.liveWatches??=[]) as Row[];const row={id:p.id,company:p.company,policyUrl:live.url,concern:live.concern,criteria:live.criteria,baselineUrl:live.baseline_url,baselineTimestamp:live.baseline_timestamp,baselineDigest:live.baseline_digest,bountyWei:live.bounty_wei,expiresAt:new Date(Number(live.expires_at)*1000).toISOString(),status:live.status,historicalReplay:false,stateVerified:true,stateReadback:compactReadback({watch:live,escrow}),transactions};const i=rows.findIndex(v=>v.id===p.id);if(i<0)rows.push(row);else rows[i]=row;});
  console.log(JSON.stringify({event:'live-watch-recorded',id:p.id,status:live.status}));
}
async function cleanupOriginals(){
  const plans=JSON.parse(await readFile('deploy/case-plan.json','utf8')).cases as Row[];
  for(const id of ['zoom-ai-training','adobe-content-access','cosmetic-date-only','challenge-upheld','challenge-rejected']){
    const p:Row={...plans.find(v=>v.id===id),id,original:true};currentCase=id;
    let watch=await r.read('Watches','get_watch',['rw_'+id]);
    let claim=await r.read('Claims','get_claim',['rc_'+id]);
    if(!claim.id&&watch.status==='OPEN'&&Number(watch.expires_at)*1000<Date.now()){
      await r.step('script:'+id+':original-refund','Bounties','refund_watch',[watch.id],'get_watch_escrow',[watch.id],row=>final(row)&&row.status==='REFUNDED');
      watch=await r.waitState('Watches','get_watch',[watch.id],row=>final(row)&&row.status==='CLOSED');
    }
    if(!claim.id&&watch.status==='CLOSED'&&(await r.read('Bounties','get_watch_escrow',[watch.id])).status==='REFUNDED'){
      p.watchTimeout=true;await record(p,watch);continue;
    }
    if(claim.status==='READY'&&Number(claim.prepare_deadline)*1000<Date.now())claim=await r.step('script:'+id+':original-claim-timeout','Claims','timeout_claim',[claim.id],'get_claim',[claim.id],row=>final(row)&&row.status==='VOID');
    if(claim.status==='VOID'&&watch.status==='OPEN'&&Number(watch.expires_at)*1000<Date.now()){
      await r.step('script:'+id+':original-refund','Bounties','refund_watch',[watch.id],'get_watch_escrow',[watch.id],row=>final(row)&&row.status==='REFUNDED');
      watch=await r.waitState('Watches','get_watch',[watch.id],row=>final(row)&&row.status==='CLOSED');
    }
    if(watch.status==='COMPILED'&&Number(watch.funding_deadline)*1000<Date.now())watch=await r.step('script:'+id+':original-timeout','Watches','expire_unfunded',[watch.id],'get_watch',[watch.id],row=>final(row)&&row.status==='VOID');
    if(watch.status==='VOID')await record(p,watch);
    else if(claim.status==='VOID')await record(p,watch,claim);
  }
}
async function closeUpheld(p:Row){
  const recorded=(await proof()).cases.find((c:Row)=>c.id===p.id);
  if(recorded?.challenge?.ruling!=='UPHELD'||recorded.challengeWindow?.closed)return;
  currentCase=p.id;
  const claim=await r.read('Claims','get_claim',[p.claimId]);
  const delay=Math.max(0,Number(claim.challenge_deadline)*1000-Date.now()+2000);
  if(delay)await sleep(delay);
  const closure=await r.read('Challenges','get_claim_summary',[p.claimId]);
  if(!closure.sealed)await r.step('script:'+p.id+':seal','Challenges','seal_claim',[p.claimId],'get_claim_summary',[p.claimId],row=>final(row)&&row.sealed===true&&row.pending===0);
  await record(p,await r.read('Watches','get_watch',[p.watchId]),claim,await r.read('Challenges','get_challenge',[p.challengeId]));
}
try {
  const funding=object((await proof()).runnerFunding);
  if(funding.hash&&funding.status!=='FINALIZED'){
    let receipt=await r.tx(funding.hash);
    while(receipt.status!=='FINALIZED'){await sleep(10000);receipt=await r.tx(funding.hash);}
    if(receipt.valueCredited!==true||receipt.valueWei!=='1000'||receipt.to?.toLowerCase()!==r.account.address.toLowerCase()||receipt.from?.toLowerCase()!=='0x1ee3b827907429e5df3db7282446b6e065ff6199')throw new Error('Owner funding transfer destination, amount, sender or final credit did not verify.');
    await updateLocalProof(p=>{p.runnerFunding={...funding,status:'FINALIZED',valueCredited:true,stateVerified:true,receipt,verifiedAt:new Date().toISOString()};});
    console.log(JSON.stringify({event:'funding-verified',hash:funding.hash,amountWei:'1000'}));
  }
  const plan=await preparePlan();
  if(plan.account.toLowerCase()!==r.account.address.toLowerCase()||plan.chainId!==61999)throw new Error('The saved plan belongs to a different test account or network.');
  if(command==='plan'||command==='status') console.log(JSON.stringify({account:r.account.address,cases:plan.cases.map((p:Row)=>p.id),liveWatches:plan.liveWatches.map((p:Row)=>p.id),depositedWei:(await proof()).depositedWei}));
  else if(command==='all') {for(const p of plan.cases)await once(p,false);for(const p of plan.liveWatches)await once(p,true);await cleanupOriginals();for(const p of plan.cases)await closeUpheld(p);}
  else if(command==='cleanup')await cleanupOriginals();
  else if(command==='close-windows')for(const p of plan.cases)await closeUpheld(p);
  else {
    const p=plan.cases.find((v:Row)=>v.id===command||v.sourceCaseId===command);
    const live=plan.liveWatches.find((v:Row)=>v.id===command);
    if(p)await once(p,false);else if(live)await once(live,true);else throw new Error('Unknown fixed case ID.');
  }
} catch(cause) {
  const error=(cause instanceof Error?cause.message:String(cause)).replaceAll(r.secret,'[redacted]').slice(0,700);
  await updateLocalProof(p=>{const failures=(p.runnerFailures??=[]) as Row[];failures.push({caseId:currentCase,error,recordedAt:new Date().toISOString()});});
  console.error(JSON.stringify({event:'stopped',case:currentCase,error,resume:'Run the same command; saved actions will not be resubmitted.'}));process.exitCode=1;
} finally {await unlink(lockPath);}

async function once(p:Row,live:boolean){
  if((await proof()).runnerCompleted?.[p.id]){console.log(JSON.stringify({event:'already-completed',id:p.id}));return;}
  const receipts=Object.keys((await proof()).receipts??{});
  if(!receipts.some(k=>k.startsWith('script:'+p.id+':')||(p.setup&&k.startsWith('script:'+p.setup.id+':'))))await r.reserveCapacity(80);
  if(live)await runLive(p);else {await runCase(p);await closeUpheld(p);}
  await updateLocalProof(proof=>{const completed=(proof.runnerCompleted??={}) as Row;completed[p.id]={completedAt:new Date().toISOString(),account:r.account.address};});
}
