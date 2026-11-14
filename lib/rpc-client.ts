import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { studioSdkRequest } from './studio-transport';

export function createReadOnlyStudioClient(options: { beforeRequest?: () => Promise<void> } = {}) {
  const client = createClient({ chain: studionet });
  return {
    readContract: ((...args: Parameters<typeof client.readContract>) => studioSdkRequest(() => client.readContract(...args), options.beforeRequest)) as typeof client.readContract,
    getTransaction: (...args: Parameters<typeof client.getTransaction>) => studioSdkRequest(() => client.getTransaction(...args), options.beforeRequest),
    getContractCode: (...args: Parameters<typeof client.getContractCode>) => studioSdkRequest(() => client.getContractCode(...args), options.beforeRequest),
  };
}
