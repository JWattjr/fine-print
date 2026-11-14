import assert from 'node:assert/strict';
import test from 'node:test';
import { transactionView } from '@/lib/transactions';

test('keeps accepted and undetermined transactions out of finalized success', () => {
  assert.equal(transactionView({ status: 5, txExecutionResult: 1, result: 6 }).stage, 'ACCEPTED');
  assert.equal(transactionView({ statusName: 'UNDETERMINED', txExecutionResultName: 'FINISHED_WITH_RETURN', resultName: 'MAJORITY_AGREE' }).stage, 'PENDING');
});

test('requires finalized successful execution and agreement', () => {
  assert.equal(transactionView({ statusName: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_RETURN', resultName: 'MAJORITY_AGREE' }).stage, 'FINALIZED_SUCCESS');
  assert.equal(transactionView({ statusName: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_ERROR', resultName: 'MAJORITY_AGREE' }).stage, 'FINALIZED_ERROR');
  assert.equal(transactionView({ statusName: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_RETURN', resultName: 'MAJORITY_DISAGREE' }).stage, 'FINALIZED_ERROR');
});
