import { readFile, rename, writeFile, mkdir, open, unlink, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

type ProofFile = Record<string, unknown>;
const journal = globalThis as typeof globalThis & { fineprintProofQueue?: Promise<unknown> };

async function acquireProofLock() {
  await mkdir(resolve(process.cwd(), '.source-cache'), { recursive: true });
  const path = resolve(process.cwd(), '.source-cache/proof-write.lock');
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const file = await open(path, 'wx', 0o600);
      await file.writeFile(JSON.stringify({ pid: process.pid })); await file.close();
      return async () => { await unlink(path); };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
      try {
        const holder = JSON.parse(await readFile(path, 'utf8')) as { pid: number };
        try { process.kill(holder.pid, 0); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { await unlink(path); continue; } }
      } catch {
        try { if (Date.now() - (await stat(path)).mtimeMs > 30000) { await unlink(path); continue; } } catch { /* Another writer released its lock. */ }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw new Error('The proof journal is busy in another process. Resume the saved action.');
}

export function localJournalRequest(request: Request): boolean {
  const url = new URL(request.url);
  return process.env.NODE_ENV === 'development'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && (!request.headers.get('origin') || request.headers.get('origin') === url.origin);
}

export function updateLocalProof<T>(update: (proof: ProofFile) => T | Promise<T>): Promise<T> {
  const task = (journal.fineprintProofQueue ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const release = await acquireProofLock();
    try {
    const path = resolve(process.cwd(), 'deploy/proof.json');
    const proof = JSON.parse(await readFile(path, 'utf8')) as ProofFile;
    const result = await update(proof);
    const temporary = `${path}.pending`;
    await writeFile(temporary, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
    return result;
    } finally { await release(); }
  });
  journal.fineprintProofQueue = task;
  return task;
}
