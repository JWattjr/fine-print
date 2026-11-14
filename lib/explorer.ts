const explorer = 'https://explorer-studio.genlayer.com';

export function explorerAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid StudioNet contract address');
  return `${explorer}/address/${address}`;
}

export function explorerTransaction(hash: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Invalid transaction hash');
  return `${explorer}/tx/${hash}`;
}

export async function verifyExplorerAddress(address: string): Promise<boolean> {
  const response = await fetch(`${explorer}/api/address/${address}`, { headers: { 'User-Agent': 'Mozilla/5.0 FinePrint/0.1' }, cache: 'no-store' });
  if (!response.ok) return false;
  const body: unknown = await response.json();
  return typeof body === 'object' && body !== null && 'type' in body && body.type === 'CONTRACT';
}

export async function verifyExplorerTransaction(hash: string): Promise<boolean> {
  const response = await fetch(`${explorer}/api/transactions/${hash}`, { headers: { 'User-Agent': 'Mozilla/5.0 FinePrint/0.1' }, cache: 'no-store' });
  return response.ok;
}
