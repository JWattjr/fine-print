import assert from 'node:assert/strict';
import test from 'node:test';
import { containsNormalized, fetchSnapshot, normalizeHtml, parseSnapshotUrl } from '@/lib/archive';
import { explorerAddress, explorerTransaction } from '@/lib/explorer';

test('parses the exact 14 digit Wayback id_ capture', () => {
  assert.deepEqual(parseSnapshotUrl('https://web.archive.org/web/20230929213507id_/https://twitter.com/en/privacy'), {
    timestamp: '20230929213507', original: 'https://twitter.com/en/privacy',
  });
  assert.deepEqual(parseSnapshotUrl('https://web.archive.org/web/20230929213507id_/https://example.com/policy?lang=en'), {
    timestamp: '20230929213507', original: 'https://example.com/policy?lang=en',
  });
  assert.throws(() => parseSnapshotUrl('https://twitter.com/en/privacy'), /Wayback id_/);
  assert.throws(() => parseSnapshotUrl('https://web.archive.org/web/20230929/https://twitter.com/en/privacy'), /14 digit/);
});

test('normalizes tags, hidden script text, entities and whitespace', () => {
  const normalized = normalizeHtml(new TextEncoder().encode('<main><p>One&nbsp;  clause</p><script>ignore this</script><p>Two &amp; three</p></main>'));
  assert.equal(normalized, 'One clause\nTwo & three');
  assert.equal(containsNormalized(normalized, 'Two   & three'), true);
  assert.equal(containsNormalized(normalized, 'two & three'), false);
  assert.equal(containsNormalized(normalized, '  '), false);
});

test('fetches only the exact CDX row and immutable id_ snapshot', async () => {
  const prior = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input); requested.push(url);
    if (url.includes('/cdx/search/cdx')) return new Response(JSON.stringify([['timestamp','original','statuscode'],['20230929213507','https://twitter.com/en/privacy','200']]), { status: 200 });
    const response = new Response('<html><main><h1>Historical terms</h1><p>We may use information to train our AI models.</p><p>This archived document contains enough text to pass the error page check and verify that the immutable snapshot content is normalized and hashed correctly.</p></main></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  }) as typeof fetch;
  try {
    const result = await fetchSnapshot('https://web.archive.org/web/20230929213507id_/https://twitter.com/en/privacy');
    assert.equal(result.original, 'https://twitter.com/en/privacy');
    assert.match(result.text, /train our AI models/);
    assert.equal(result.digest.length, 64);
    assert.equal(requested.length, 2);
    assert.ok(requested.every((url) => url.startsWith('https://web.archive.org/')));
  } finally { globalThis.fetch = prior; }
});

test('builds only the canonical StudioNet Explorer links', () => {
  assert.equal(explorerAddress('0x'+'1'.repeat(40)), `https://explorer-studio.genlayer.com/address/0x${'1'.repeat(40)}`);
  assert.equal(explorerTransaction('0x'+'a'.repeat(64)), `https://explorer-studio.genlayer.com/tx/0x${'a'.repeat(64)}`);
  assert.throws(() => explorerAddress('0x123'), /Invalid/);
  assert.throws(() => explorerTransaction('0x123'), /Invalid/);
});
