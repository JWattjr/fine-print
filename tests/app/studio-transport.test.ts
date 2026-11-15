import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadOnlyStudioClient } from '../../lib/rpc-client';
import { transactionView } from '../../lib/transactions';

test('SDK reads use the scoped browser user agent and request budget without changing unrelated fetches', async () => {
  const original = globalThis.fetch;
  const observed: Array<{ url: string; headers: Headers }> = [];
  let rpcResult:unknown=Buffer.from('pinned source').toString('base64');
  globalThis.fetch = async (input, init) => {
    observed.push({ url: String(input), headers: new Headers(init?.headers) });
    return Response.json({ jsonrpc: '2.0', id: 1, result: rpcResult });
  };
  try {
    let reserved = 0;
    const client = createReadOnlyStudioClient({ beforeRequest: async () => { reserved += 1; } });
    assert.equal('writeContract' in client, false);
    assert.equal(await client.getContractCode('0x1111111111111111111111111111111111111111'), 'pinned source');
    assert.equal(reserved, 1);
    assert.match(observed[0].headers.get('user-agent') ?? '', /^Mozilla\/5\.0/);
    await fetch('https://example.test/', { headers: { 'x-task': 'read' } });
    assert.equal(reserved, 1);
    assert.equal(observed[1].headers.get('user-agent'), null);
    assert.equal(observed[1].headers.get('x-task'), 'read');
    await fetch('https://studio.genlayer.com/api');
    assert.equal(reserved, 1);
    assert.equal(observed[2].headers.get('user-agent'), null);
    rpcResult={hash:'0x'+'a'.repeat(64),type:0,status:'FINALIZED',value:10,value_credited:true,result:5,consensus_data:null};
    const native=await client.getTransaction({hash:('0x'+'a'.repeat(64)) as `0x${string}` & {length:66}});
    assert.equal(native.type,0,'Raw StudioNet native type must survive the read path.');
    assert.equal(transactionView(native).stage,'FINALIZED_SUCCESS');
    assert.equal(reserved,2);
  } finally { globalThis.fetch = original; }
});
