import Link from 'next/link';
import { LiveCase } from '@/components/live-case';
import { notFound } from 'next/navigation';
import { Topline } from '@/components/topline';
import { proof, observedLimitation } from '@/lib/proof';
import { explorerAddress, explorerTransaction } from '@/lib/explorer';

function highlightPassage(text: string | undefined, passage: string) {
  if (!text || !passage) return text || 'No archived text excerpt was recorded.';
  const pattern = passage.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const match = new RegExp(pattern).exec(text);
  if (!match || match.index === undefined) return text;
  return <>{text.slice(0, match.index)}<mark className="mark-change">{match[0]}</mark>{text.slice(match.index + match[0].length)}</>;
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.startsWith('chain-') && /^[a-zA-Z0-9_-]{1,64}$/.test(id.slice(6))) {
    const recorded = proof.cases.find(row => row.claimId === id.slice(6));
    const limitation = recorded ? observedLimitation(recorded) : '';
    return <><Topline /><div className="page">{limitation && <p className="notice"><strong>Recorded limitation</strong><br />{limitation}</p>}<LiveCase key={id} claimId={id.slice(6)} /></div></>;
  }
  const cases = proof.cases;
  const item = cases.find((row) => row.id === id);
  if (!item) notFound();
  const index = cases.indexOf(item);
  const previous = cases[index - 1];
  const next = cases[index + 1];
  const limitation = observedLimitation(item);
  const transactions = new Map(Object.entries(item.transactions));
  const addReceipt = (label: string, hash: string | undefined) => {
    if (hash && ![...transactions.values()].includes(hash)) transactions.set(label, hash);
  };
  addReceipt('Challenge judgment', item.challenge?.transactionHash);
  addReceipt('Hunter payout', item.payout?.transactionHash);

  if (item.kind === 'COMPILE' || item.kind === 'WATCH_TIMEOUT') return <><Topline /><div className="page">
    {item.runLabel && <p className="notice">{item.runLabel} · original case {item.sourceCaseId}</p>}
    <header className="subhead"><div><h1>{item.company} · {item.kind === 'WATCH_TIMEOUT' ? 'watch timeout case' : 'compilation case'}</h1><p>{item.concern}</p></div><span className="tag gray">{item.verdict}</span></header>
    <div className="case-meta"><span>CASE {item.id}</span><span>HISTORICAL REPLAY</span><span>{statusLabel(item.status)}</span><span>POLICY {item.policyUrl}</span></div>
    <div className="section-rule" /><h2 className="section-label" style={{ marginTop: 22 }}>{item.kind === 'WATCH_TIMEOUT' ? 'Actual watch timeout result' : 'Actual compilation result'}</h2>
    <p className="notice">{item.explanation}</p><p className="quiet" style={{ marginTop: 14 }}>{item.kind === 'WATCH_TIMEOUT' ? 'No claim judgment was submitted. The expired escrow was reserved for refund to the original sponsor.' : 'Compilation ended before watch funding or a claim. No bounty or bond was accepted for this case.'}</p>
    {item.criteria.length > 0 && <ol className="criteria-list">{item.criteria.map((criterion, criterionIndex) => <li className="criteria-item" key={criterionIndex}><span>{criterion.text}</span><span className="tag gray">NOT RUN</span></li>)}</ol>}
    <h2 className="section-label" style={{ marginTop: 27 }}>Transaction receipts</h2>{[...transactions].map(([label, hash]) => <div className="transaction-card" key={hash}><strong>{label}</strong><span className="mono">{hash}</span><a className="inline-link" href={explorerTransaction(hash)} target="_blank" rel="noreferrer">StudioNet Explorer ↗</a></div>)}
    <h2 className="section-label" style={{ marginTop: 27 }}>Contract evidence</h2>{Object.entries(proof.contracts).map(([label, value]) => <div className="transaction-card" key={label}><strong>{label}</strong><span className="mono">{value.address}</span><a className="inline-link" href={explorerAddress(value.address)} target="_blank" rel="noreferrer">GenLayer Explorer Contract ↗</a></div>)}
    <nav className="case-nav" aria-label="Case navigation">{previous ? <Link className="inline-link" href={`/case/${previous.id}`}>← {previous.company} · previous case</Link> : <span />}{next ? <Link className="inline-link" href={`/case/${next.id}`}>{next.company} · next case →</Link> : <span />}</nav>
    <p style={{ marginTop: 24 }}><Link href="/ledger" className="inline-link">← Change Ledger</Link></p>
  </div></>;

  return <><Topline/><div className="page">
    {item.runLabel && <p className="notice">{item.runLabel} · original case {item.sourceCaseId}</p>}
    {limitation && <p className="notice"><strong>Observed limitation</strong><br />{limitation}</p>}
    <header className="subhead"><div><h1>{item.company} · policy case</h1><p>{item.concern}</p></div><span className={`tag ${item.status === 'FINALIZED_SUCCESS' ? '' : 'gray'}`}>{statusLabel(item.status)}</span></header>
    <div className="case-meta"><span>CASE {item.id}</span><span>{item.historicalReplay ? 'HISTORICAL REPLAY' : 'PRODUCTION WATCH'}</span><span>VERDICT {item.verdict}</span><span>BOUNTY {item.bountyWei} WEI</span><span>POLICY {item.policyUrl}</span></div>
    {item.challengeWindow && <div className="notice" style={{ marginTop: 17 }}><strong>Native appeal and challenge window</strong><br/>Deadline: {item.challengeWindow.deadline} · {item.challengeWindow.closed ? 'closed' : 'open'}. The payout is not counted as final until the required window closes and its credit is read back.</div>}
    <div className="section-rule"/><h2 className="section-label" style={{ marginTop: 22 }}>Frozen checks</h2>
    <ol className="criteria-list">{item.criteria.map((criterion, criterionIndex) => <li className="criteria-item" key={`${criterion.text}-${criterionIndex}`}><span>{criterion.text}{criterion.quote && <blockquote className="quote">“{criterion.quote}”</blockquote>}</span><span className={`tag ${criterion.verdict === 'TRIGGERED' ? '' : 'gray'}`}>{criterion.verdict}</span></li>)}</ol>
    <div className="case-meta"><span>BASELINE {item.baseline.timestamp}</span><span>SHA-256 {item.baseline.digest}</span><a href={item.baseline.url} target="_blank" rel="noreferrer">Open archived baseline ↗</a></div>
    <div className="case-meta"><span>LATER {item.later.timestamp}</span><span>SHA-256 {item.later.digest}</span><a href={item.later.url} target="_blank" rel="noreferrer">Open later capture ↗</a></div>
    <div className="redline"><section className="redline-pane"><h3>Baseline · Wayback snapshot</h3><p>{item.baseline.excerpt || 'No matching passage was found in the frozen baseline excerpt.'}</p><a className="inline-link" href={item.baseline.url} target="_blank" rel="noreferrer">Open baseline snapshot ↗</a></section><section className="redline-pane"><h3>Later capture · Wayback snapshot</h3><p>{highlightPassage(item.later.excerpt, item.passage)}</p><a className="inline-link" href={item.later.url} target="_blank" rel="noreferrer">Open later snapshot ↗</a></section></div>
    <h2 className="section-label" style={{ marginTop: 27 }}>Claim and challenge</h2><blockquote className="quote">“{item.passage}”</blockquote><p className="quiet" style={{ marginTop: 12 }}>{item.explanation}</p>
    <div className="steps"><div className="step-row"><time>Validator result</time><span>{item.verdict} · {statusLabel(item.status)}</span><span className="step-state">{item.finalized ? 'FINALIZED' : 'AWAITING FINALITY'}</span></div><div className="step-row"><time>Challenge</time><span>{item.challenge ? `${item.challenge.ground} · ${item.challenge.evidence}` : 'No challenge was submitted.'}</span><span className="step-state">{item.challenge?.ruling ?? 'NONE'}</span></div><div className="step-row"><time>Settlement</time><span>{item.payout ? `Hunter ${item.payout.recipient} · ${item.payout.amountWei} wei` : 'No payout was recorded.'}</span><span className="step-state">{item.payout?.creditVerified ? 'CREDIT VERIFIED' : 'NOT VERIFIED'}</span></div></div>
    <h2 className="section-label" style={{ marginTop: 27 }}>Transaction receipts</h2>{transactions.size ? [...transactions.entries()].map(([label, hash]) => <div className="transaction-card" key={`${label}-${hash}`}><strong>{label}</strong>{proof.receipts[label]?.stage==='FINALIZED_ERROR' && <span className="tag red">Finalized error · retained receipt</span>}<span className="mono">{hash}</span><a className="inline-link" href={explorerTransaction(hash)} target="_blank" rel="noreferrer">StudioNet Explorer ↗</a></div>) : <p className="quiet">No transaction hashes are recorded for this case.</p>}
    <h2 className="section-label" style={{ marginTop: 27 }}>Contracts</h2>{Object.entries(proof.contracts).map(([label, value]) => <div className="transaction-card" key={label}><strong>{label}</strong><span className="mono">{value.address}</span><a className="inline-link" href={explorerAddress(value.address)} target="_blank" rel="noreferrer">StudioNet contract ↗</a></div>)}
    <nav className="case-nav" aria-label="Case navigation">{previous ? <Link className="inline-link" href={`/case/${previous.id}`}>← {previous.company} · previous case</Link> : <span/>}{next ? <Link className="inline-link" href={`/case/${next.id}`}>{next.company} · next case →</Link> : <span/>}</nav>
    {item.claimId && <LiveCase key={item.claimId} claimId={item.claimId} />}
    <p style={{ marginTop: 24 }}><Link href="/ledger" className="inline-link">← Change Ledger</Link></p>
  </div></>;
}
