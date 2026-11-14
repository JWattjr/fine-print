import contractFile from '@/deploy/contracts.json';

export const CONTRACT_NAMES = ['Watches', 'Claims', 'Challenges', 'Bounties', 'ChangeLedger'] as const;
export type ContractName = typeof CONTRACT_NAMES[number];
export const VIEW_METHODS: Record<ContractName, readonly string[]> = {
  Watches: ['get_watch', 'list_watches', 'get_config'],
  Claims: ['get_claim', 'get_active_claim', 'list_claims', 'get_config'],
  Challenges: ['get_challenge', 'get_claim_summary', 'list_challenges', 'get_config'],
  Bounties: ['get_ticket', 'get_deposit', 'get_watch_escrow', 'get_bond', 'get_credit', 'get_settlement', 'list_credits', 'get_accounting', 'get_config'],
  ChangeLedger: ['get_entry', 'list_entries', 'get_hunter', 'list_hunters', 'get_config'],
};

export function contractAddress(name: ContractName): string | null {
  const address = (contractFile as Record<string, { address?: string }>)[name]?.address;
  return /^0x[\da-fA-F]{40}$/.test(address ?? '') ? address! : null;
}

export function contractsDeployed() { return CONTRACT_NAMES.every((name) => contractAddress(name)); }

export type ReadCondition = { field: string; equals?: string | number | boolean; oneOf?: Array<string | number | boolean> };
export type ReadSpec = { contract: ContractName; method: string; args: Array<string | number | boolean>; focus?: string; until?: ReadCondition; also?: ReadCondition[] };

export function readbackMatches(value: unknown, spec: ReadSpec): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const conditions = [...(spec.until ? [spec.until] : []), ...(spec.also ?? [])];
  return conditions.every((condition) => {
    const field = (value as Record<string, unknown>)[condition.field];
    const matches = (expected: unknown) => typeof field === 'string' && typeof expected === 'string'
      && /^0x[\da-fA-F]{40}$/.test(field) && /^0x[\da-fA-F]{40}$/.test(expected)
      ? field.toLowerCase() === expected.toLowerCase() : field === expected;
    return condition.oneOf ? condition.oneOf.some(matches) : matches(condition.equals);
  });
}

export function contextExcerpt(text: string, focus?: string): string {
  if (!focus) return text.slice(0, 2500);
  const normalized = text.replace(/\s+/g, ' ').trim();
  const needle = focus.replace(/\s+/g, ' ').trim();
  const index = normalized.indexOf(needle);
  if (index >= 0) return normalized.slice(Math.max(0, index - 500), Math.max(0, index - 500) + 2500);
  const words = new Set(needle.toLowerCase().match(/[a-z]{5,}/g) ?? []);
  let best = '';
  let bestScore = 0;
  for (const paragraph of text.split(/\n{2,}/)) {
    const tokens = new Set(paragraph.toLowerCase().match(/[a-z]{5,}/g) ?? []);
    const score = [...words].filter((word) => tokens.has(word)).length / Math.sqrt(Math.max(1, tokens.size));
    if (score > bestScore) { best = paragraph; bestScore = score; }
  }
  return (best || text).slice(0, 2500);
}

export function compactReadback(value: unknown, focus?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => compactReadback(item, focus));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const passage = typeof record.passage === 'string' ? record.passage : focus;
  return Object.fromEntries(Object.entries(record).map(([key, item]) => {
    if (['baseline_text', 'snapshot_text'].includes(key) && typeof item === 'string') return [`${key}_preview`, contextExcerpt(item, passage)];
    return [key, compactReadback(item, focus)];
  }));
}
