import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { createProtectedRecovery, type RecoveryCrypto } from './protected-recovery.js';
const crypto:RecoveryCrypto={
 generate:async()=>({generation:randomUUID(),key:randomBytes(32).toString('hex')}),
 address:async value=>createHash('sha256').update(value).digest('hex'),
 seal:async(key,aad,value)=>{const nonce=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),nonce);cipher.setAAD(Buffer.from(aad));return Buffer.concat([nonce,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');},
 open:async(key,aad,value)=>{const bytes=Buffer.from(value,'base64');const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),bytes.subarray(0,12));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');},
};
function fixture(){
 const secrets=new Map<string,string>();const rows=new Map<string,string>();let failClear=false;let failSecrets=false;
 const ports={crypto,secure:{read:async(key:string)=>{if(failSecrets)throw Error('private platform error');return secrets.get(key)??null;},write:async(key:string,value:string)=>{if(failSecrets)throw Error('private platform error');secrets.set(key,value);},remove:async(key:string)=>{secrets.delete(key);}},
 records:{read:async(key:string)=>rows.get(key)??null,write:async(key:string,value:string)=>{rows.set(key,value);},remove:async(key:string)=>{rows.delete(key);},clear:async()=>{if(failClear)throw Error('private platform error');rows.clear();}}};
 return {ports,secrets,rows,create:()=>createProtectedRecovery(ports),failClear:(value:boolean)=>{failClear=value;},failSecrets:(value:boolean)=>{failSecrets=value;}};
}
test('encrypted recovery survives restart, scopes users and authenticates journal identity',async()=>{
 const f=fixture();const vault=f.create();const a=await vault.open('alice');const b=await vault.open('bob');
 await a.write('one','private piano 🎹');await a.write('two','other record');
 assert.equal(await b.read('one'),null);assert.equal(await (await f.create().open('alice')).read('one'),'private piano 🎹');
 assert.equal(JSON.stringify([...f.rows.values()]).includes('private piano'),false);
 const entries=[...f.rows.entries()];f.rows.set(entries[0]![0],entries[1]![1]);await assert.rejects(a.read('one'),/^Error: inventory_storage_unavailable$/);
});
test('clear invalidates old handles, deletes key and rows, permits fresh same-account handle',async()=>{
 const f=fixture();const v=f.create();const old=await v.open('alice');await old.write('one','private');const key=[...f.secrets.values()][0];
 await v.clear();assert.equal(f.rows.size,0);assert.equal(f.secrets.size,0);await assert.rejects(old.write('one','resurrect'));
 const fresh=await v.open('alice');assert.equal(await fresh.read('one'),null);await fresh.write('one','fresh');assert.notEqual([...f.secrets.values()][0],key);await assert.rejects(old.read('one'));
});
test('cleanup failure persists a restart barrier and fresh open retries cleanup',async()=>{
 const f=fixture();const v=f.create();const old=await v.open('alice');await old.write('one','private');f.failClear(true);
 await assert.rejects(v.clear(),/^Error: inventory_storage_unavailable$/);await assert.rejects(old.write('one','resurrect'));await assert.rejects(f.create().open('alice'));
 f.failClear(false);const fresh=await f.create().open('alice');assert.equal(await fresh.read('one'),null);assert.equal(f.rows.size,0);
});
test('sign-out requested during encryption suppresses the pending write',async()=>{
 const f=fixture();let release!:()=>void;let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
 f.ports.crypto={...crypto,seal:async(...args)=>{const encrypted=await crypto.seal(...args);started();await new Promise<void>(resolve=>{release=resolve;});return encrypted;}};
 const v=f.create();const a=await v.open('alice');const writing=a.write('one','private');const rejected=assert.rejects(writing);await ready;const clearing=v.clear();release();await rejected;await clearing;assert.equal(f.rows.size,0);
});
test('secure storage unavailable fails closed without exposing platform errors',async()=>{
 const f=fixture();f.failSecrets(true);await assert.rejects(f.create().open('alice'),/^Error: inventory_storage_unavailable$/);assert.equal(f.rows.size,0);
});
test('concurrent same-account handles share key and serialize replacement and removal',async()=>{
 const f=fixture();const v=f.create();const [a,b]=await Promise.all([v.open('alice'),v.open('alice')]);
 await Promise.all([a.write('one','first'),b.write('one','second')]);assert.equal(await a.read('one'),'second');await b.remove('one');assert.equal(await a.read('one'),null);
});

test('sign-out requested during decryption never returns the old plaintext',async()=>{
 const f=fixture();let release!:()=>void;let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
 f.ports.crypto={...crypto,open:async(...args)=>{const plaintext=await crypto.open(...args);started();await new Promise<void>(resolve=>{release=resolve;});return plaintext;}};
 const v=f.create();const a=await v.open('alice');await a.write('one','private');const reading=a.read('one');const rejected=assert.rejects(reading);await ready;const clearing=v.clear();release();await rejected;await clearing;
});
test('key tampering and malformed metadata fail closed rather than resetting recoverable drafts',async()=>{
 const f=fixture();const v=f.create();const a=await v.open('alice');await a.write('one','private');const secretName=[...f.secrets.keys()][0]!;
 f.secrets.set(secretName,'not valid');await assert.rejects(a.read('one'));await assert.rejects(f.create().open('alice'));assert.equal(f.rows.size,1);
 await v.clear();assert.equal(f.rows.size,0);
});

test('selected-media chunks are encrypted, bound to scope and invalidated on sign-out',async()=>{
 const {createSelectedMediaStore}=await import('./selected-media.js');
 const f=fixture();const vault=f.create();const storage=await vault.open('alice');
 const scope={userID:'alice',dealerID:'shop',recordID:'@capture'};
 const source=new Uint8Array(300000).fill(91);
 const selected=createSelectedMediaStore({sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),scope,storage});
 await selected.put('photo-selection',source);
 assert.equal(f.rows.size,4);
 assert.ok([...f.rows.keys()].every(key=>!key.includes('alice')&&!key.includes('photo-selection')));
 assert.ok([...f.rows.values()].every(value=>!value.includes('"data"')&&!value.includes('5b'.repeat(20))));
 const restored=createSelectedMediaStore({sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),scope,storage:await f.create().open('alice')});
 assert.deepEqual(await restored.read('photo-selection'),source);
 const other=createSelectedMediaStore({sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),scope:{...scope,userID:'bob'},storage:await vault.open('bob')});
 assert.equal(await other.read('photo-selection'),null);
 const entries=[...f.rows.entries()];f.rows.set(entries[0]![0],entries[1]![1]);
 await assert.rejects(restored.read('photo-selection'),/^Error: selected_media_unavailable$/);
 await vault.clear();assert.equal(f.rows.size,0);
 await assert.rejects(selected.read('photo-selection'),/^Error: selected_media_unavailable$/);
});
test('sign-out during selected-media hashing suppresses final plaintext disclosure',async()=>{
 const {createSelectedMediaStore}=await import('./selected-media.js');
 const f=fixture();const vault=f.create();const storage=await vault.open('alice');
 let blocked=false;let release!:()=>void;let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
 const selected=createSelectedMediaStore({scope:{userID:'alice',dealerID:'shop',recordID:'@capture'},storage,sha256:async bytes=>{
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(blocked){started();await new Promise<void>(resolve=>{release=resolve;});}
  return digest;
 }});
 await selected.put('selection',new Uint8Array([1,2,3]));blocked=true;
 const reading=selected.read('selection');const rejected=assert.rejects(reading,/selected_media_unavailable/);
 await ready;await vault.clear();release();await rejected;
});

test('large customer checkpoints survive encrypted restart while inventory bounds remain independent',async()=>{
 const {createCustomerRecoveryJournal}=await import('./customer-recovery.js');
 const {customerFormFromAttributes,customerFormIssues}=await import('./customer-form.js');
 const {createInventoryRecoveryJournal}=await import('./inventory-recovery.js');
 const f=fixture();const vault=f.create();const storage=await vault.open('alice');
 const form=customerFormFromAttributes({name:'Ada',isBusiness:false,email:'ada@example.test',locations:[{key:'home',label:'Home',street1:'1 Main',city:'Town',region:'State',postalCode:'123',timezone:'UTC'}],pianos:Array.from({length:200},(_,i)=>({key:'p'+i,locationKey:'home',nickname:'Piano',form:'grand',player:false,notes:'x'.repeat(2000)}))});
 assert.deepEqual(customerFormIssues(form,new Set(['UTC'])),[]);
 const cp={version:1 as const,baseline:{id:'profile',revision:1,attributes:form},draft:form,pending:{kind:'save' as const,id:'profile',revision:1,attributes:form},conflict:false};
 assert.ok(Buffer.byteLength(JSON.stringify(cp))>1024*1024);
 const port={scope:{userID:'alice',apiBaseURL:'https://api.example.test'},storage,zones:new Set(['UTC']),now:()=>1000};
 await createCustomerRecoveryJournal(port).save(cp);
 const restored=await createCustomerRecoveryJournal({...port,storage:await f.create().open('alice')}).load();assert.deepEqual(restored.checkpoint,cp);
 const inventory=createInventoryRecoveryJournal<string>({scope:{userID:'alice',dealerID:'shop',recordID:'piano'},storage,now:()=>1000,validate:(v:unknown):v is string=>typeof v==='string'});
 await assert.rejects(inventory.save('x'.repeat(1024*1024)));
 await assert.rejects(storage.write('oversized','😀'.repeat(1024*1024+1)),/^Error: inventory_storage_unavailable$/);
});
