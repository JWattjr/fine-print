import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export type ArchiveSnapshot = { timestamp: string; original: string; url: string; text: string; digest: string };

export function parseSnapshotUrl(snapshotUrl: string): { timestamp: string; original: string } {
  const match = /^https:\/\/web\.archive\.org\/web\/(\d{14})id_\/(https?:\/\/[^\s#]+)$/i.exec(snapshotUrl);
  if (!match) throw new Error('Use a Wayback id_ snapshot URL with a 14 digit timestamp and no fragment.');
  const original = new URL(match[2]);
  if (!['http:', 'https:'].includes(original.protocol) || !original.hostname) throw new Error('The archived original URL must use HTTP or HTTPS.');
  return { timestamp: match[1], original: match[2] };
}

export function normalizeHtml(bytes: Uint8Array): string {
  let body = Buffer.from(bytes);
  if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body);
  const source = body.toString('utf8');
  return decodeEntities(source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|section|article|br|tr|td|th)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    const key = code.toLowerCase();
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    if (key === 'nbsp') return ' ';
    const point = key.startsWith('#x') ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

export async function fetchSnapshot(snapshotUrl: string): Promise<ArchiveSnapshot> {
  const { timestamp, original } = parseSnapshotUrl(snapshotUrl);
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(original)}&output=json&filter=statuscode:200&fl=timestamp,original,statuscode&from=${timestamp}&to=${timestamp}`;
  const headers = { 'User-Agent': 'Mozilla/5.0 FinePrint/0.1', Accept: 'application/json,text/html;q=0.9,*/*;q=0.8' };
  const cdxResponse = await fetch(cdxUrl, { headers, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!cdxResponse.ok) throw new Error(`Wayback CDX returned ${cdxResponse.status}.`);
  const cdxText = await cdxResponse.text();
  const cdxRows = JSON.parse(cdxText) as unknown;
  if (!Array.isArray(cdxRows) || !cdxRows.some((row) => Array.isArray(row) && row[0] === timestamp && row[1] === original && row[2] === '200')) throw new Error('CDX has no successful capture for this exact URL and timestamp.');
  const response = await fetch(snapshotUrl, { headers, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!response.ok || new URL(response.url).hostname !== 'web.archive.org') throw new Error(`Wayback snapshot returned ${response.status} or redirected away from the archive.`);
  const text = normalizeHtml(new Uint8Array(await response.arrayBuffer()));
  if (text.length < 200 || /wayback machine error|page not found|this url has been excluded/i.test(text.slice(0, 800))) throw new Error('The archive response is empty or an error page.');
  return { timestamp, original, url: snapshotUrl, text, digest: createHash('sha256').update(text, 'utf8').digest('hex') };
}

export function containsNormalized(haystack: string, needle: string): boolean {
  const text = haystack.replace(/\s+/g, ' ').trim();
  const passage = needle.replace(/\s+/g, ' ').trim();
  return !!passage && text.includes(passage);
}
