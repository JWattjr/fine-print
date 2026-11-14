import Link from 'next/link';
import { ArrowUpRight, FileClock, FileDiff, Files, Gavel, Search, ShieldCheck, WalletCards } from 'lucide-react';
import { ActionMonitor } from '@/components/action-monitor';
import { confirmedCases } from '@/lib/proof';

const primary = [
  { href: '/', label: 'The desk', icon: Files },
  { href: '/ledger', label: 'Change ledger', icon: FileDiff },
  { href: '/watches', label: 'Open watches', icon: Search },
  { href: '/transactions', label: 'Transactions', icon: FileClock },
  { href: '/credits', label: 'Credits & refunds', icon: WalletCards },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="app-frame">
    <ActionMonitor />
    <aside className="rail">
      <Link href="/" className="wordmark" aria-label="Fine Print home"><span className="mark">fp</span><span>fine print</span></Link>
      <div className="rail-kicker">The policy desk</div>
      <nav className="rail-nav" aria-label="Main navigation">
        {primary.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className="rail-link"><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Change ledger' && <span className="nav-count">{confirmedCases().length}</span>}</Link>)}
      </nav>
      <div className="rail-divider" />
      <div className="rail-kicker">Take part</div>
      <nav className="rail-nav" aria-label="Hunter tools">
        <Link href="/watches/new" className="rail-link"><span className="nav-plus">+</span><span>Start a watch</span></Link>
        <Link href="/claims/new" className="rail-link"><Gavel size={17} strokeWidth={1.8} /><span>File a claim</span></Link>
      </nav>
      <div className="rail-bottom">
        <div className="network-chip"><span className="status-dot" />StudioNet <span className="chain-id">61999</span></div>
        <div className="rail-note"><ShieldCheck size={15} /> Decisions enter the ledger after finality.</div>
        <div className="rail-footer"><span>Fine Print · alpha</span><Link href="/about">How it works <ArrowUpRight size={13} /></Link></div>
      </div>
    </aside>
    <main className="workbench">{children}</main>
  </div>;
}
