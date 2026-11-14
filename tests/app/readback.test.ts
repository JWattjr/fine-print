import assert from 'node:assert/strict';
import test from 'node:test';
import { readbackMatches, compactReadback, contextExcerpt, type ReadSpec } from '@/lib/studio-contracts';

const judgment: ReadSpec = { contract: 'Claims', method: 'get_claim', args: ['claim-1'], until: { field: 'status', oneOf: ['TRIGGERED', 'NOT_TRIGGERED', 'UNCLEAR', 'VOID'] } };

test('an older finalized preparation cannot satisfy a judgment readback', () => {
  assert.equal(readbackMatches({ status: 'READY', finalized: true }, judgment), false);
  assert.equal(readbackMatches({ status: 'PENDING_JUDGMENT', finalized: false }, judgment), false);
  assert.equal(readbackMatches({ status: 'TRIGGERED', finalized: true }, judgment), true);
  assert.equal(readbackMatches({}, judgment), false);
});

test('business rejection and void states finish tracking without another write', () => {
  assert.equal(readbackMatches({ status: 'NOT_TRIGGERED', finalized: true }, judgment), true);
  assert.equal(readbackMatches({ status: 'VOID', finalized: true }, judgment), true);
  assert.equal(readbackMatches({ sealed: false }, { contract: 'Challenges', method: 'get_claim_summary', args: ['claim-1'], until: { field: 'sealed', equals: true } }), false);
});

test('peer address readback accepts checksum casing while status values remain exact', () => {
  const peer: ReadSpec = { contract: 'Watches', method: 'get_config', args: [], until: { field: 'configured', equals: true }, also: [{ field: 'bounties', equals: '0xc321fd3bd9d611d067f43d1df6fa2c814c90656c' }] };
  assert.equal(readbackMatches({ configured: true, bounties: '0xC321Fd3bD9d611D067f43D1Df6FA2c814c90656c' }, peer), true);
  assert.equal(readbackMatches({ configured: true, bounties: '0x1111111111111111111111111111111111111111' }, peer), false);
  assert.equal(readbackMatches({ status: 'triggered' }, judgment), false);
});

test('native pull tracking binds the new attempt as well as the resulting status', () => {
  const pull: ReadSpec = { contract: 'Bounties', method: 'get_credit', args: ['credit-1'], until: { field: 'attempt', equals: 2 }, also: [{ field: 'status', oneOf: ['TRANSFER_PENDING', 'VERIFYING', 'AVAILABLE', 'PAID'] }] };
  assert.equal(readbackMatches({ attempt: 1, status: 'AVAILABLE' }, pull), false);
  assert.equal(readbackMatches({ attempt: 2, status: 'TRANSFER_PENDING' }, pull), true);
});

test('cached readbacks keep hashes and bounded previews instead of full policy bodies', () => {
  const compact = compactReadback({ baseline_digest: 'hash', baseline_text: 'x'.repeat(20000), nested: { snapshot_text: 'y'.repeat(20000) } }) as { baseline_digest: string; baseline_text_preview: string; nested: { snapshot_text_preview: string } };
  assert.equal(compact.baseline_digest, 'hash');
  assert.equal(compact.baseline_text_preview.length, 2500);
  assert.equal(compact.nested.snapshot_text_preview.length, 2500);
});

test('the redline preview includes a caught passage located late in a document', () => {
  const text = 'Introductory policy language. '.repeat(300) + 'We may train AI using service data.' + ' Other terms.'.repeat(100);
  const excerpt = contextExcerpt(text, 'We may train AI using service data.');
  assert.ok(excerpt.includes('We may train AI using service data.'));
  assert.ok(excerpt.length <= 2500);
});
