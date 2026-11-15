import assert from 'node:assert/strict';
import test from 'node:test';
import { transactionView } from '@/lib/transactions';

test('final native transfers use the actual native credit flag', () => {
  const paid = transactionView({ type: 0, status: 'FINALIZED', value: 10, value_credited: true, triggered_by: 'parent', from_address: 'escrow', to_address: 'hunter' });
  assert.equal(paid.stage, 'FINALIZED_SUCCESS');
  assert.equal(paid.execution, 'NATIVE_CREDITED');
  assert.equal(paid.valueWei, '10');
  assert.equal(paid.triggeredBy, 'parent');
  assert.equal(transactionView({ type: 0, status: 'FINALIZED', value_credited: false }).stage, 'FINALIZED_ERROR');
  assert.equal(transactionView({ type: 0, status: 'ACCEPTED', value_credited: true }).stage, 'ACCEPTED');
});

test('explicit typeHex preserves native transfers without accepting failed payable calls', () => {
  const paid=transactionView({type:undefined,typeHex:'0x0',status:7,statusName:'FINALIZED',value:10n,value_credited:true,result:5,consensus_data:null});
  assert.equal(paid.stage,'FINALIZED_SUCCESS');
  assert.equal(paid.execution,'NATIVE_CREDITED');
  assert.equal(paid.consensus,'NATIVE_TRANSFER');
  const failedCall=transactionView({typeHex:'0x2',status:'FINALIZED',value_credited:true,tx_execution_result:'ERROR',result:6});
  assert.equal(failedCall.stage,'FINALIZED_ERROR','A credited payable contract call still requires successful execution.');
});
