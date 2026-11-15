import proofFile from '@/deploy/proof.json';

export type ContractProof = { address: string; explorer: string; sourceSha256?: string };
export type TxReceipt = {
  stage?: string;
  status?: string;
  execution?: string;
  consensus?: string;
  txReceipt?: string;
  stateReadback?: unknown;
  stateVerified?: boolean;
  recordedAt?: string;
};
export type CaseCriterion = { text: string; verdict: 'TRIGGERED' | 'NOT_TRIGGERED' | 'UNCLEAR' | 'NOT_RUN'; quote?: string };
export type CaseProof = {
  id: string;
  sourceCaseId?: string;
  runLabel?: string;
  observedLimitation?: string;
  company: string;
  policyUrl: string;
  concern: string;
  criteria: CaseCriterion[];
  baseline: { url: string; timestamp: string; digest: string; excerpt?: string };
  later: { url: string; timestamp: string; digest: string; excerpt?: string };
  passage: string;
  verdict: 'TRIGGERED' | 'NOT_TRIGGERED' | 'UNCLEAR' | 'REJECTED' | 'CODE_REJECTED' | 'VOID' | 'NO_AGREEMENT';
  watchId?: string;
  claimId?: string;
  kind?: 'COMPILE' | 'CLAIM' | 'WATCH_TIMEOUT';
  stateVerified?: boolean;
  stateReadback?: unknown;
  explanation: string;
  challenge?: { id?: string; ground: string; evidence: string; challenger?: string; ruling: string; transactionHash?: string };
  challengeWindow?: { deadline: string; closed: boolean };
  payout?: { amountWei: string; recipient: string; transactionHash: string; creditVerified: boolean };
  bountyWei: string;
  claimant: string;
  status: 'FINALIZED_SUCCESS' | 'FINALIZED_ERROR' | 'PENDING' | 'ACCEPTED' | 'SUBMITTED';
  historicalReplay: boolean;
  finalized: boolean;
  transactions: Record<string, string>;
};
export type LiveWatchProof = {
  id: string;
  company: string;
  policyUrl: string;
  concern: string;
  criteria: string[];
  baselineUrl: string;
  baselineTimestamp: string;
  baselineDigest: string;
  bountyWei: string;
  expiresAt: string;
  status: string;
  historicalReplay: boolean;
  transactions: Record<string, string>;
};
export type ProofDocument = {
  project: string;
  network: { name: string; chainId: number; rpc: string; explorer: string };
  runner: string;
  contracts: Record<string, ContractProof>;
  transactions: Record<string, string>;
  receipts: Record<string, TxReceipt>;
  valueTransfers?: Array<{ label: string; hash: string; amountWei: string; purpose?: string; stage?: string; valueCredited?: boolean }>;
  probeResults?: Record<string, Record<string, unknown>>;
  cases: CaseProof[];
  liveWatches: LiveWatchProof[];
  liveWatchAttempts?: Array<{id:string;company:string;policyUrl:string;concern:string;status:string;reason:string;transactionHash:string;bountyDepositedWei:string}>;
  depositedWei: string;
  recordedAt: string | null;
  blockers: string[];
};

export const proof = proofFile as unknown as ProofDocument;

export function observedLimitation(item: CaseProof): string {
  return item.observedLimitation ?? '';
}

export function confirmedCases(data: ProofDocument = proof): CaseProof[] {
  return data.cases.filter((item) => item.status === 'FINALIZED_SUCCESS'
    && item.finalized
    && item.verdict === 'TRIGGERED'
    && item.challengeWindow?.closed === true
    && item.payout?.creditVerified === true);
}

export function openWatches(data: ProofDocument = proof, at = Date.now()): LiveWatchProof[] {
  return data.liveWatches.filter((watch) => watch.status === 'OPEN'
    && !watch.historicalReplay
    && Date.parse(watch.expiresAt) > at);
}

export function hunterStats(address: string, data: ProofDocument = proof) {
  const normalized = address.toLowerCase();
  const cases = data.cases.filter((item) => item.finalized && item.status === 'FINALIZED_SUCCESS');
  const confirmed = confirmedCases(data);
  return {
    confirmed: cases.filter((item) => confirmed.includes(item) && item.claimant.toLowerCase() === normalized).length,
    rejected: cases.filter((item) => item.claimant.toLowerCase() === normalized && item.verdict === 'NOT_TRIGGERED').length,
    challengesWon: cases.filter((item) => (item.challenge?.ruling === 'UPHELD' && item.challenge.challenger?.toLowerCase() === normalized) || (item.challenge?.ruling === 'REJECTED' && item.claimant.toLowerCase() === normalized)).length,
  };
}
