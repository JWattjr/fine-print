import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('runner calls exist in the frozen deployed contract interfaces', () => {
  const sources: Record<string,string> = { Watches:'watches', Claims:'claims', Challenges:'challenges', Bounties:'bounties', ChangeLedger:'change_ledger' };
  const methods = new Map(Object.entries(sources).map(([name,file]) => [name, new Set([...readFileSync(`contracts/${file}.py`,'utf8').matchAll(/@gl\.public\.(?:write|view)(?:\.payable)?(?:\([^\n]*\))?\s+def\s+(\w+)\(/g)].map(match=>match[1]))]));
  let checked=0;
  for(const file of ['scripts/run-case.ts','scripts/runner-runtime.ts']){
    const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    function visit(node:ts.Node){
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
        const name=node.expression.name.text;
        const offset=name==='step'?1:['read','waitState'].includes(name)?0:-1;
        const contract=node.arguments[offset],method=node.arguments[offset+1];
        if(offset>=0&&contract&&method&&ts.isStringLiteral(contract)&&ts.isStringLiteral(method)&&methods.has(contract.text)){
          checked++;
          assert.ok(methods.get(contract.text)!.has(method.text),`${file}: deployed ${contract.text}.${method.text} does not exist`);
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
  assert.ok(checked>30,'The interface audit must inspect the runner calls.');
});
