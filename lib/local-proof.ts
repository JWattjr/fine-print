import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type ProofFile = Record<string, unknown>;
const journal = globalThis as typeof globalThis & { fineprintProofQueue?: Promise<unknown> };

export function localJournalRequest(request: Request): boolean {
  const url = new URL(request.url);
  return process.env.NODE_ENV === 'development'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && (!request.headers.get('origin') || request.headers.get('origin') === url.origin);
}

export function updateLocalProof<T>(update: (proof: ProofFile) => T | Promise<T>): Promise<T> {
  const task = (journal.fineprintProofQueue ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const path = resolve(process.cwd(), 'deploy/proof.json');
    const proof = JSON.parse(await readFile(path, 'utf8')) as ProofFile;
    const result = await update(proof);
    const temporary = `${path}.pending`;
    await writeFile(temporary, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
    return result;
  });
  journal.fineprintProofQueue = task;
  return task;
}
