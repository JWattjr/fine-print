import { updateLocalProof } from '../lib/local-proof';
const [key, caseId, reason] = process.argv.slice(2);
await updateLocalProof(p => {
  const receipts = p.receipts as Record<string, Record<string, unknown>>;
  if (receipts[key]?.stage !== 'FINALIZED_ERROR') throw new Error('Only a finalized error can be retained.');
  Object.assign(receipts[key], { failureDisposition: 'RETAINED_NOT_RETRIED', failureReason: reason });
  const failures = ((p as any).caseFailures ??= []) as Record<string, unknown>[];
  if (!failures.some(f => f.caseId === caseId)) failures.push({ caseId, status: 'JUDGMENT_NO_AGREEMENT', reason, receiptKey: key, hash: receipts[key].hash });
});
console.log('retained', caseId);
