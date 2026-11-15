import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
// Shared with the autonomous runner and Python Explorer verifier. Run one writer
// at a time; final verification starts only after the runner has stopped.
export async function verificationSlot() {
  await mkdir('.source-cache/runner',{recursive:true});
  const path='.source-cache/runner/request-times.json';
  let times:number[]=existsSync(path)?JSON.parse(await readFile(path,'utf8')):[];
  times=times.filter(t=>Date.now()-t<3600000);
  if(times.length>=440){await new Promise(resolve=>setTimeout(resolve,Math.max(1000,times[0]+3600000-Date.now()+1000)));times=times.filter(t=>Date.now()-t<3600000);}
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,(times.at(-1)??0)+2500-Date.now())));
  times.push(Date.now());await writeFile(path+'.pending',JSON.stringify(times));await rename(path+'.pending',path);
}
