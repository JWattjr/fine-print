'use client';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { withStudioRequestBudget } from '@/lib/studio-budget';

export type WalletProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
declare global { interface Window { ethereum?: WalletProvider } }

async function studioWallet(requestAccounts: boolean) {
  const injected = window.ethereum;
  if (!injected) throw new Error('Open this local page in a browser with a compatible wallet extension.');
  const accounts = await injected.request({ method: requestAccounts ? 'eth_requestAccounts' : 'eth_accounts' }) as string[];
  if (!accounts?.[0]) throw new Error('Select a wallet account first.');
  let chainId = await injected.request({ method: 'eth_chainId' });
  if (chainId !== '0xf22f' && requestAccounts) {
    try {
      await injected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xf22f' }] });
    } catch (error) {
      if ((error as { code?: number }).code !== 4902) throw error;
      await injected.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0xf22f', chainName: 'GenLayer StudioNet', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }, rpcUrls: ['https://studio.genlayer.com/api'], blockExplorerUrls: ['https://explorer-studio.genlayer.com'] }] });
    }
    chainId = await injected.request({ method: 'eth_chainId' });
  }
  if (chainId !== '0xf22f') throw new Error('Switch the connected wallet to StudioNet (chain 61999) to read or write Fine Print.');
  const provider: WalletProvider = {
    request: async (args) => {
      if (['eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'].includes(args.method)) return injected.request(args);
      if (args.method !== 'eth_sendTransaction') return withStudioRequestBudget(() => injected.request(args));
      const tx = args.params?.[0] as Record<string, unknown>;
      return withStudioRequestBudget(() => injected.request({ ...args, params: [{ ...tx, chainId: '0xf22f', type: '0x0', value: tx.value ?? '0x0' }] }));
    },
  };
  return { account: accounts[0].toLowerCase(), client: createClient({ chain: studionet, account: accounts[0] as `0x${string}`, provider }) };
}

export function connectStudioWallet() { return studioWallet(true); }
export function readConnectedStudioWallet() { return studioWallet(false); }
