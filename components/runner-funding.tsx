'use client';
import { useState } from 'react';
import { connectStudioWallet } from '@/lib/wallet';
import { explorerTransaction } from '@/lib/explorer';
export function RunnerFunding({ address, savedHash }: { address: string; savedHash: string }) {
  const [hash, setHash] = useState(savedHash);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="form-stack"><p>Dedicated test account · StudioNet 61999</p><p className="mono">{address}</p><p>One native transfer of <strong>1,000 wei</strong>. Contract deposits remain capped at 1,110 wei across the entire project. This transfer funds the runner and is not an escrow deposit.</p>
    <button className="primary-button" disabled={busy || !!hash} onClick={async () => {
      setBusy(true); setError('');
      try {
        const wallet = await connectStudioWallet();
        if (wallet.account !== '0x1ee3b827907429e5df3db7282446b6e065ff6199') throw new Error('Select the approved owner account.');
        const transaction = await window.ethereum!.request({ method: 'eth_sendTransaction', params: [{ from: wallet.account, to: address, value: '0x3e8', chainId: '0xf22f', type: '0x0' }] }) as string;
        localStorage.setItem('fineprint:runner-funding', transaction); setHash(transaction);
        const result = await fetch('/api/internal/runner-funding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hash: transaction }) });
        if (!result.ok) throw new Error('Transfer submitted; disk journal needs reconciliation from the displayed hash.');
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Funding request failed.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Waiting for wallet…' : hash ? 'Funding transfer submitted' : 'Fund test account · 1,000 wei'}</button>
    {hash && <a className="inline-link" href={explorerTransaction(hash)}>{hash} ↗</a>}{error && <p role="status">{error}</p>}
  </section>;
}
