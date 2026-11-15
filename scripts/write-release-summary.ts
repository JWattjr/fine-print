import { readFile, writeFile } from 'node:fs/promises';
import { updateLocalProof } from '../lib/local-proof';
import { explorerAddress, explorerTransaction } from '../lib/explorer';
import { contextExcerpt } from '../lib/studio-contracts';
import { createHash } from 'node:crypto';
type Row=Record<string,any>;
const proof=JSON.parse(await readFile('deploy/proof.json','utf8')) as Row;
const plan=JSON.parse(await readFile('deploy/runner-plan.json','utf8')) as Row;
const complete=[...plan.cases,...plan.liveWatches].every((p:Row)=>proof.runnerCompleted?.[p.id]);
if(!complete)throw new Error('Requested scripted execution is not complete; refusing to write a final report.');
for(const id of ['zoom-ai-training','adobe-content-access','cosmetic-date-only','challenge-upheld','challenge-rejected']){
  if(!proof.cases.some((c:Row)=>c.id===id&&c.finalized===true))throw new Error('Original timeout cleanup is incomplete: '+id);
}
const archiveNames=['zoom-baseline','zoom-change','zoom-ai-grant','x-baseline','x-change','adobe-baseline','adobe-june-revision'];
const archives:Row[]=[];
for(const name of archiveNames){
  try{
    const archive=JSON.parse(await readFile('.source-cache/'+name+'.json','utf8'));
    if(createHash('sha256').update(archive.text).digest('hex')!==archive.digest)throw new Error('Archive cache digest mismatch: '+name);
    archives.push(archive);
  }catch(cause){if((cause as NodeJS.ErrnoException).code!=='ENOENT')throw cause;}
}
for(const c of proof.cases){
  for(const side of ['baseline','later']){
    const snapshot=c[side];
    const archive=archives.find(a=>a.digest===snapshot?.digest&&a.url===snapshot?.url);
    if(archive)snapshot.excerpt=contextExcerpt(archive.text,side==='baseline'?(c.challenge?.ground==='ALREADY_EXISTED'?c.challenge.evidence:c.passage):c.passage);
  }
}
await updateLocalProof(p=>{p.cases=proof.cases;});
const falsePositive=proof.cases.find((c:Row)=>c.sourceCaseId==='cosmetic-date-only'&&c.verdict==='TRIGGERED');
if(falsePositive){
  falsePositive.observedLimitation='Observed false positive: the date-only passage triggered an extra compiler-generated absence criterion. The two permission criteria were NOT_TRIGGERED.';
  await updateLocalProof(p=>{
    const c=(p.cases as Row[]).find(c=>c.id===falsePositive.id);if(c)c.observedLimitation=falsePositive.observedLimitation;
    const blockers=(p.blockers??=[]) as string[];
    const limitation='The cosmetic date-only case finalized TRIGGERED because compilation added an absence criterion. This observed false positive remains unresolved; the owner prohibited contract edits or redeployment.';
    if(!blockers.includes(limitation))blockers.push(limitation);
  });
}
const principal=(c:Row)=>{
  const entries=Object.entries<string>(c.transactions??{});
  return c.challenge?.transactionHash??entries.find(([key])=>['timeout_claim','expire_unfunded'].includes(proof.receipts[key]?.method))?.[1]??entries.find(([key])=>key.endsWith(':original-timeout')&&proof.receipts[key]?.stage==='FINALIZED_SUCCESS')?.[1]??(c.kind==='WATCH_TIMEOUT'?entries.find(([key])=>proof.receipts[key]?.method==='refund_watch')?.[1]:undefined)??entries.find(([key])=>key.endsWith(':judge'))?.[1]??entries.find(([key])=>key.endsWith(':prepare'))?.[1]??entries.at(-1)?.[1];
};
const tx=explorerTransaction;
const rows=proof.cases.map((c:Row)=>`| ${c.id}${c.runLabel?' · '+c.runLabel:''} | ${c.verdict}${c.challenge?' · challenge '+c.challenge.ruling:''}${c.payout?.creditVerified?' · '+c.payout.amountWei+' wei paid':''} | [Finalized receipt](${tx(principal(c))}) |`);
const watches=proof.liveWatches.map((w:Row)=>`| ${w.company} · ${w.id} | ${w.bountyWei} wei | ${w.expiresAt} | ${w.baselineTimestamp} |`);
const attempts=(proof.liveWatchAttempts??[]).map((w:Row)=>`| ${w.company} · ${w.id} | ${w.status}: ${w.reason} | ${w.bountyDepositedWei} wei | [Finalized receipt](${tx(w.transactionHash)}) |`);
const failedCalls=Object.values<Row>(proof.receipts).filter(r=>r.stage==='FINALIZED_ERROR').map(r=>`| ${r.method} | ${r.execution} | ${r.failureReason??'See the finalized receipt.'} | [Finalized error](${tx(r.hash)}) |`);
const contracts=Object.entries<Row>(proof.contracts).map(([name,c])=>`| ${name} | [${c.address}](${explorerAddress(c.address)}) |`);
const report=`# Actual execution results\n\nPublic app: https://fine-print-ten.vercel.app/\n\nPublic repository: https://github.com/JWattjr/fine-print\n\n${falsePositive?'The cosmetic case produced an observed false positive. Its two permission criteria were NOT_TRIGGERED, while an extra compiler-generated absence criterion was TRIGGERED by the date-only passage. These deployed contracts have not been edited or redeployed. This limitation prevents a submission-ready claim.':'Read every actual outcome below; no result is inferred from its planned target.'}\n\n## Cases\n\n| Case | Actual finalized result | Evidence |\n| --- | --- | --- |\n${rows.join('\n')}\n\n## Current funded watches\n\n| Watch | Bounty | Expiry (UTC) | Latest available baseline |\n| --- | --- | --- | --- |\n${watches.join('\n')}\n\nCurrent watches use their creation time as the as-of time. The latest successful archived capture can be older than the current policy; its timestamp is shown explicitly.\n\n## Deployed contracts — StudioNet 61999\n\nEach direct contract Explorer link is a separate evidence entry.\n\n| Contract | GenLayer Explorer Contract |\n| --- | --- |\n${contracts.join('\n')}\n\n## Value and execution\n\nCumulative contract deposits: **${proof.depositedWei} wei / 1,110 wei approved**. Refunds and payouts do not reset this cumulative cap. The owner's separate **1,000-wei** native transfer funded the dedicated runner account and is not an escrow deposit: [funding receipt](${tx(proof.runnerFunding.hash)}).\n\nThe dedicated account acted as sponsor, hunter and challenger for scripted demonstrations. These runs demonstrate the validator and deterministic contract paths; they do not demonstrate independent market participation. The original owner-funded failures are retained. Fresh timing-recovery IDs are labeled explicitly, and no finalized judgment was rerun to force an expected outcome.\n\nSee [the runner guide](RUNNER.md), [the 90-second demo](DEMO.md), and the final verification report for the checks that actually completed.\n`;
await writeFile('docs/RESULTS.md',report+(attempts.length?'\n## Unfunded current-watch attempts\n\n| Attempt | Actual result | Deposit | Evidence |\n| --- | --- | --- | --- |\n'+attempts.join('\n')+'\n\nThe Adobe VOID attempt was retained without a retry. A distinct GitHub policy and concern replaced it in the funded docket.\n':'')+(failedCalls.length?'\n## Retained transaction errors\n\n| Call | Actual execution | Disposition | Evidence |\n| --- | --- | --- | --- |\n'+failedCalls.join('\n')+'\n\nThe incorrect zero-value cleanup call was not resubmitted. A new timeout-only action used the deployed `timeout_claim` method, without repeating a claim judgment or deposit.\n':''));
let readme=await readFile('README.md','utf8');
readme=readme.replace(/^Launch status .*$/m,`Execution status: the requested scripted runs and current-watch funding are complete. Actual results and receipts are in [docs/RESULTS.md](docs/RESULTS.md). ${falsePositive?'The cosmetic case exposes a compiler false positive, so the app is not described as submission ready.':'Final readiness depends on the complete verification report.'}`);
const begin='<!-- BEGIN ACTUAL RESULTS -->',end='<!-- END ACTUAL RESULTS -->';
const block=`${begin}\n\n## Actual results\n\n| Case | Actual finalized result | Evidence |\n| --- | --- | --- |\n${rows.join('\n')}\n\n**Contract deposits: ${proof.depositedWei} / 1,110 wei.** Current funded watches: ${proof.liveWatches.length}. Direct contract evidence and watch expiry dates are listed in [the complete results](docs/RESULTS.md).\n\n${end}`;
readme=readme.includes(begin)?readme.slice(0,readme.indexOf(begin))+block+readme.slice(readme.indexOf(end)+end.length):readme+'\n'+block+'\n';
await writeFile('README.md',readme);
const path='docs/submission/portal-fields.json';const portal=JSON.parse(await readFile(path,'utf8'));
portal.website='https://fine-print-ten.vercel.app/';portal.github='https://github.com/JWattjr/fine-print';
const labels=['baseline passage','date-only','injection','prior substance','genuine change'];
const outcomes=plan.cases.map((p:Row,index:number)=>{const c=proof.cases.find((c:Row)=>c.id===p.id);return labels[index]+': '+c.verdict+(c.challenge?', challenge '+c.challenge.ruling:'');}).join('; ');
portal.description='Fine Print is a StudioNet policy-watch bounty app with five deployed contracts. Wayback baselines and later passages feed validator judgments; code controls bonds, deadlines, refunds and verified native payouts. Actual scripted outcomes: '+outcomes+'. Original timing failures remain recorded; recovery IDs are labeled. The date-only TRIGGERED result is a compiler false positive. Funded current watches show archive timestamps and expiries. Public receipts retain actual outcomes; the contracts were not edited or redeployed.';
portal.howTo[0].instruction='Browse the recorded case journal and finalized ledger without a wallet. Compare archived passages, criteria, actual verdicts and challenge rulings. The date-only result is flagged as an observed false positive; original timeout and VOID paths remain visible. Follow each case receipt and direct StudioNet contract link.';
portal.expectedOutcome=`Actual execution and receipts are published, including unexpected verdicts and original timing failures. ${proof.liveWatches.length} current watches are funded. Contract deposits total ${proof.depositedWei} wei under the owner's 1,110-wei cap. The cosmetic compiler false positive remains an explicit product limitation; no contract was edited or redeployed to hide it.`;
portal.evidenceEntries=Object.entries<Row>(proof.contracts).map(([name,c])=>({type:'GenLayer Explorer Contract',title:name+' — StudioNet 61999',url:explorerAddress(c.address)}));
if(portal.oneLiner.length>180||portal.description.length>1000||portal.expectedOutcome.length>500)throw new Error('Submission field length limit exceeded.');
await writeFile(path,JSON.stringify(portal,null,2)+'\n');
let demo=await readFile('docs/DEMO.md','utf8');
const demoBegin='<!-- BEGIN RECORDED RUN NOTES -->',demoEnd='<!-- END RECORDED RUN NOTES -->';
const demoRows=plan.cases.map((p:Row,index:number)=>{const c=proof.cases.find((c:Row)=>c.id===p.id);return `- ${labels[index]}: **${c.verdict}**${c.challenge?' · challenge **'+c.challenge.ruling+'**':''}${c.payout?.creditVerified?' · '+c.payout.amountWei+' wei paid':''}. [Receipt](${tx(principal(c))}).`;});
const notes=`${demoBegin}\n\n## Recorded run notes\n\n${demoRows.join('\n')}\n\nThe original timing failures remain in [the full receipts](RESULTS.md). Recovery IDs are labeled “re-run after a timing failure.” There are ${proof.liveWatches.length} funded current watches and ${proof.depositedWei} wei of cumulative contract deposits. The compiler false positive prevents a submission-ready claim.\n\n${demoEnd}`;
demo=demo.includes(demoBegin)?demo.slice(0,demo.indexOf(demoBegin))+notes+demo.slice(demo.indexOf(demoEnd)+demoEnd.length):demo+'\n'+notes+'\n';
await writeFile('docs/DEMO.md',demo);
console.log(JSON.stringify({ok:true,cases:proof.cases.length,liveWatches:proof.liveWatches.length,depositedWei:proof.depositedWei,semanticLimitation:!!falsePositive}));
