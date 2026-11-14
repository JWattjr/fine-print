'use client';
import { ActionButton } from '@/components/action-button';
import { useActionRecord } from '@/components/action-status';
import { CONTRACT_NAMES, type ContractName } from '@/lib/studio-contracts';
import { explorerAddress } from '@/lib/explorer';

type ContractCard = { name: ContractName; file: string; sha256: string; address?: string; owner?: string };
const peers: Record<ContractName, Array<[string, ContractName]>> = {
  Watches: [['bounties', 'Bounties']],
  Claims: [['watches', 'Watches'], ['bounties', 'Bounties'], ['challenges', 'Challenges'], ['ledger', 'ChangeLedger']],
  Challenges: [['watches', 'Watches'], ['claims', 'Claims'], ['bounties', 'Bounties'], ['ledger', 'ChangeLedger']],
  Bounties: [['watches', 'Watches'], ['claims', 'Claims'], ['challenges', 'Challenges'], ['ledger', 'ChangeLedger']],
  ChangeLedger: [['watches', 'Watches'], ['claims', 'Claims'], ['challenges', 'Challenges'], ['bounties', 'Bounties']],
};

function Card({ card, cards, verified }: { card: ContractCard; cards: ContractCard[]; verified: boolean }) {
  const deployment = useActionRecord(`deploy-${card.name}`);
  const complete = CONTRACT_NAMES.every((name) => cards.some((item) => item.name === name && item.address));
  const bindings = peers[card.name].map(([field, name]) => ({ field, address: cards.find((item) => item.name === name)?.address ?? '' }));
  return <article className="credit-card form-stack">
    <div className="transaction-heading"><h2 className="section-label">{card.name}</h2><span className="tag gray">{card.address ? 'Address recorded' : 'Not deployed'}</span></div>
    <p className="mono">{card.file}<br/>SHA-256 {card.sha256}</p>
    {card.address && <a className="inline-link mono" href={explorerAddress(card.address)} target="_blank" rel="noreferrer">GenLayer Explorer Contract · {card.address} ↗</a>}
    {!card.address && <ActionButton disabled={!verified} spec={{ key: `deploy-${card.name}`, label: `Deploy ${card.name}`, contract: card.name, method: 'deploy', args: [] }}>Deploy {card.name} · 0 GEN</ActionButton>}
    {deployment?.stage === 'FINALIZED_SUCCESS' && !card.address && <p className="notice">Deployment finalized. Reload the saved manifest to load its address.</p>}
    {card.address && <>
      <details><summary>Review immutable peer addresses</summary>{bindings.map((binding) => <p className="mono" key={binding.field}>{binding.field}: {binding.address || 'awaiting deployment'}</p>)}</details>
      <ActionButton disabled={!complete} spec={{ key: `configure-${card.name}`, label: `Configure ${card.name} peers once`, contract: card.name, method: 'configure', args: bindings.map((binding) => binding.address), expectedAccount: card.owner, readback: { contract: card.name, method: 'get_config', args: [], until: { field: 'configured', equals: true }, also: bindings.map((binding) => ({ field: binding.field, equals: binding.address })) } }}>Configure {card.name} peers · 0 GEN</ActionButton>
    </>}
  </article>;
}

export function ContractDeploy({ cards, verified }: { cards: ContractCard[]; verified: boolean }) {
  return <div className="form-stack">
    <p className={verified ? 'notice success-notice' : 'notice'}>{verified ? 'Every selected archive capture has passed its finalized source probe.' : 'Main deployment is locked until all selected archive captures pass their finalized probes.'} Deployments and peer configuration send 0 GEN. Bounties and bonds need separate owner approval.</p>
    <button className="secondary-button" type="button" onClick={() => window.location.reload()}>Reload saved manifest and source gate</button>
    {cards.map((card) => <Card key={card.name} card={card} cards={cards} verified={verified} />)}
  </div>;
}
