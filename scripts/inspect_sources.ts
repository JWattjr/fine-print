/** Read-only Wayback fetches; cached text is a preview, never authoritative proof. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fetchSnapshot, type ArchiveSnapshot } from '../lib/archive';
import { PROBE_SOURCES, snapshotUrl } from '../lib/probe-sources';

const directory = resolve(process.cwd(), '.source-cache');
await mkdir(directory, { recursive: true });
for (const source of PROBE_SOURCES) {
  const path = resolve(directory, `${source.id}.json`);
  let snapshot: ArchiveSnapshot;
  try {
    snapshot = JSON.parse(await readFile(path, 'utf8')) as ArchiveSnapshot;
    if (snapshot.url !== snapshotUrl(source)) throw new Error('Cached source mismatch.');
  } catch {
    snapshot = await fetchSnapshot(snapshotUrl(source));
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 3000));
  }
  const matches = [...snapshot.text.matchAll(/artificial intelligence|machine learning|train(?:ing)?|access (?:your )?content|last updated|effective (?:as of|date)|service generated data/gi)];
  const excerpts = matches.slice(0, 18).map((match) => snapshot.text.slice(Math.max(0, match.index! - 140), match.index! + 600));
  process.stdout.write(`${JSON.stringify({ id: source.id, url: snapshot.url, digest: snapshot.digest, chars: snapshot.text.length, excerpts })}\n`);
}
