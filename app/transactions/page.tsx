import {Topline} from '@/components/topline';
import {proof} from '@/lib/proof';
import {TransactionLog,type TransactionRow} from '@/components/transaction-log';

export default function TransactionsPage(){
  const rows=Object.entries(proof.transactions).map(([label,hash]):TransactionRow=>{
    const receipt=proof.receipts[label]??{};
    const stage=(receipt.stage??'SUBMITTED') as TransactionRow['stage'];
    return {label,hash,stage,status:receipt.status??stage,execution:receipt.execution??'Waiting for execution result',consensus:receipt.consensus??'Waiting for consensus',txReceipt:receipt.txReceipt,stateVerified:receipt.stateVerified,stateReadback:receipt.stateReadback};
  });
  return <><Topline/><div className="page"><header className="subhead"><div><h1>Transaction log</h1><p>Each hash is saved before polling. The page resumes the same transaction after reload and checks finalized contract state.</p></div><span className="tag gray">{rows.length} recorded</span></header><div className="section-rule"/><TransactionLog initialRows={rows}/><div className="notice" style={{marginTop:18}}><strong>Native appeal window</strong><br/>Submitted, pending, accepted and undetermined states remain visible. Only FINALIZED with successful execution and agreement counts as a completed transaction.</div></div></>;
}
