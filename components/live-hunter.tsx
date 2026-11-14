'use client';
import { useState } from 'react';
import { readStudio } from '@/lib/studio-actions';
import { contractsDeployed } from '@/lib/studio-contracts';

export function LiveHunter({ address }: { address: string }) {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [at, setAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <section className="live-section form-stack"><h2 className="section-label">Live ChangeLedger profile</h2><button className="secondary-button" disabled={busy || !contractsDeployed()} onClick={async () => { setBusy(true); setError(''); try { const result = await readStudio({ contract: 'ChangeLedger', method: 'get_hunter', args: [address] }); setState(result.value as Record<string, unknown>); setAt(result.readAt); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Live profile read failed.'); } finally { setBusy(false); } }}>{busy ? 'Reading finalized record…' : 'Read live finalized profile'}</button>{state && <div className="profile-stats"><div><strong>{String(state.confirmed_catches ?? 0)}</strong><span>Confirmed catches</span></div><div><strong>{String(state.rejected_claims ?? 0)}</strong><span>Rejected claims</span></div><div><strong>{String(state.challenges_won ?? 0)}</strong><span>Challenges won</span></div></div>}{at && <p className="quiet">Live read at {new Date(at).toLocaleString()} · StudioNet latest-final</p>}{error && <p role="status" className="wallet-error">{error}</p>}</section>;
}
