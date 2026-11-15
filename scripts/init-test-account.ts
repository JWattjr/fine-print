import { createAccount, generatePrivateKey } from 'genlayer-js';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
if (!existsSync('.env')) {
  const key = generatePrivateKey();
  await writeFile('.env', `FINE_PRINT_TEST_PRIVATE_KEY=${key}\n`, { flag: 'wx', mode: 0o600 });
}
const env = await readFile('.env', 'utf8');
const key = env.match(/^FINE_PRINT_TEST_PRIVATE_KEY=(0x[\da-fA-F]{64})$/m)?.[1] as `0x${string}` | undefined;
if (!key) throw new Error('Dedicated account key is missing; existing .env was preserved.');
let account: ReturnType<typeof createAccount>;
try { account = createAccount(key); }
catch { throw new Error('The dedicated account key is invalid. It was not logged.'); }
const publicInfo = { address: account.address, chainId: 61999, network: 'StudioNet', fundingLimitWei: '1000', contractDepositCapWei: '1000' };
await writeFile('deploy/test-account.json', JSON.stringify(publicInfo, null, 2) + '\n');
console.log(JSON.stringify(publicInfo));
