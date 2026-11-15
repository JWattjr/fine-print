import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { studioSdkRequest } from './studio-transport';

export function readStudioTransaction(hash: string, beforeRequest?: () => Promise<void>): Promise<Record<string,unknown>> {
  return studioSdkRequest(async()=>{
    // SDK 1.1.8 applies an Ethereum formatter that erases numeric StudioNet type 0.
    // Preserve the raw receipt so native credits and contract execution stay distinct.
    const response=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionByHash',params:[hash]})});
    const payload=await response.json();
    if(!response.ok||payload.error)throw new Error(String(payload.error?.message??'StudioNet transaction read failed.'));
    if(!payload.result||typeof payload.result!=='object')throw new Error('StudioNet transaction not found.');
    return payload.result;
  },beforeRequest);
}

export function createReadOnlyStudioClient(options: { beforeRequest?: () => Promise<void> } = {}) {
  const client = createClient({ chain: studionet });
  return {
    readContract: ((...args: Parameters<typeof client.readContract>) => studioSdkRequest(() => client.readContract(...args), options.beforeRequest)) as typeof client.readContract,
    getTransaction: (args: Parameters<typeof client.getTransaction>[0]) => readStudioTransaction(args.hash,options.beforeRequest),
    getContractCode: (...args: Parameters<typeof client.getContractCode>) => studioSdkRequest(() => client.getContractCode(...args), options.beforeRequest),
  };
}
