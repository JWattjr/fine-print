'use client';
import { useState } from 'react';
import { WalletCards } from 'lucide-react';

export function Topline() {
  const [account, setAccount] = useState('');
  const [error, setError] = useState('');
  async function connect() {
    setError('');
    const provider = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<unknown> } }).ethereum;
    if (!provider) { setError('Install a compatible wallet to sign StudioNet transactions.'); return; }
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      if (!accounts[0]) throw new Error('Choose an account in your wallet.');
      setAccount(`${accounts[0].slice(0, 6)}…${accounts[0].slice(-4)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Wallet connection failed.'); }
  }
  return <div className="topline"><div className="topline-left"><span className="topline-mark">●</span><span>PUBLIC RECORD · FINALIZED RESULTS ONLY</span></div><div className="topline-right"><span>{error && <span role="status" className="wallet-error">{error}</span>}</span><button className="wallet-button" onClick={connect}><WalletCards size={14} />{account || 'Connect wallet'}</button></div></div>;
}
