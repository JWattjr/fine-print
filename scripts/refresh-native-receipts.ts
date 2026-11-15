/** Read-only reconciliation after the SDK transaction-type parsing correction. */
import { readFile } from 'node:fs/promises';
import { createReadOnlyStudioClient } from '../lib/rpc-client';
import { transactionView } from '../lib/transactions';
import { updateLocalProof } from '../lib/local-proof';
import { verificationSlot } from './verification-budget';

const proof=JSON.parse(await readFile('deploy/proof.json','utf8'));
const client=createReadOnlyStudioClient({beforeRequest:verificationSlot});
let count=0;
for(const [key,record] of Object.entries<any>(proof.receipts)){
  if(record.method!=='native_transfer')continue;
  const raw=await client.getTransaction({hash:record.hash});
  const receipt=transactionView(raw);
  if(receipt.stage!=='FINALIZED_SUCCESS'||receipt.valueCredited!==true||receipt.execution!=='NATIVE_CREDITED'||receipt.valueWei!==record.valueWei||receipt.triggeredBy!==record.triggeredBy||receipt.from?.toLowerCase()!==record.from?.toLowerCase()||receipt.to?.toLowerCase()!==record.to?.toLowerCase())throw new Error('Native receipt identity or final credit mismatch: '+key);
  await updateLocalProof(p=>{
    const receipts=p.receipts as Record<string,unknown>;
    receipts[key]={...record,...receipt,parserReconciledAt:new Date().toISOString(),recordedAt:new Date().toISOString()};
  });
  count++;
}
console.log(JSON.stringify({readOnly:true,nativeReceiptsRefreshed:count}));
