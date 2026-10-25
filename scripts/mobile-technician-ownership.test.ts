import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import ts from 'typescript';
import {createTechnicianOwnershipRegistry} from '../packages/client-core/src/technician-ownership';

test('native ownership survives module re-evaluation in the same runtime',async()=>{
 const source=readFileSync(new URL('../apps/mobile/src/technician/ownership.ts',import.meta.url),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context=createContext({});
 const instantiate=new Script('(function(require,exports){'+output+'\n})').runInContext(context);
 const load=()=>{const exports:Record<string,any>={};instantiate((name:string)=>{assert.equal(name,'@pianotechpros/client-core');return {createTechnicianOwnershipRegistry};},exports);return exports.mobileTechnicianOwnership;};
 const first=load();const lease=await first.acquire('same-account');const reloaded=load();assert.equal(first,reloaded);assert.equal(await reloaded.acquire('same-account'),null);
 await lease.release();const next=await reloaded.acquire('same-account');assert.ok(next);await lease.release();assert.equal(await first.acquire('same-account'),null);await next.release();
});
