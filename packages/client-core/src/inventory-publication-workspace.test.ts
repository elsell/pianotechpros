import assert from 'node:assert/strict';
import test from 'node:test';
import {createInventoryPublicationWorkspace,type PublicationCommand} from './inventory-publication-workspace.js';
function fixture(){
 let state={record:{id:'p',dealer_id:'d',revision:3,status:'available'},publication:null as null|{visible:boolean},title:'Private'};
 let live=true;let id='p';let denied=false;let lost=false;let inMutation=false;let autosave=false;let calls=0;
 const commands:PublicationCommand[]=[];
 const port={userID:'u',dealerID:'d',recordID:'p',active:()=>live&&id==='p',copy:(s:typeof state)=>structuredClone(s),
  withMutation:async<T>(work:()=>Promise<T>)=>{assert.equal(inMutation,false);inMutation=true;try{if(autosave){state.record.revision++;autosave=false;}return await work();}finally{inMutation=false;}},
  get:async()=>{assert.equal(inMutation,true);if(denied)throw 'denied';return structuredClone(state);},
  execute:async(command:PublicationCommand,revision:number)=>{assert.equal(inMutation,true);calls++;if(denied)throw 'denied';if(revision!==state.record.revision)throw 'conflict';commands.push(structuredClone(command));state.record.revision++;if(command.kind==='publish')state.publication={visible:true};if(command.kind==='unpublish')state.publication={visible:false};if(command.kind==='transition')state.record.status=command.status;if(lost)throw 'network';return structuredClone(state);},
  classify:(e:unknown):'denied'|'conflict'|'rejected'|'uncertain'=>e==='denied'?'denied':e==='conflict'?'conflict':e==='invalid'?'rejected':'uncertain',
 };
 return {port,commands,calls:()=>calls,state:()=>state,edit:()=>{state.record.revision++;},autosave:()=>{autosave=true;},deny:()=>{denied=true;},lose:()=>{lost=true;},leave:()=>{live=false;},switchRecord:()=>{id='other';}};
}
test('review is explicit, immutable and confirmed once through the editor boundary',async()=>{
 const f=fixture();const w=createInventoryPublicationWorkspace(f.port);
 await assert.rejects(w.confirm());assert.equal(f.calls(),0);
 const command:PublicationCommand={kind:'transition',status:'sold',salePrice:{minor_units:123,currency:'USD'},reason:''};
 await w.review(command);command.salePrice!.minor_units=1;
 const view=w.snapshot();view.review!.state.title='Changed';
 assert.equal(w.snapshot().review!.state.title,'Private');assert.equal(f.calls(),0);
 const first=w.confirm();await assert.rejects(w.confirm());await first;
 assert.equal(f.calls(),1);assert.deepEqual(f.commands[0],{kind:'transition',status:'sold',salePrice:{minor_units:123,currency:'USD'},reason:''});assert.equal(w.snapshot().outcome,'succeeded');assert.equal(w.snapshot().review,null);
 await assert.rejects(w.confirm());assert.equal(f.calls(),1);
});
for(const source of ['remote','autosave'] as const)test(`${source} edits after review require a fresh review`,async()=>{
 const f=fixture();const w=createInventoryPublicationWorkspace(f.port);await w.review({kind:'publish'});source==='remote'?f.edit():f.autosave();
 await assert.rejects(w.confirm());assert.equal(f.calls(),0);assert.equal(w.snapshot().failure,'conflict');assert.equal(w.snapshot().review,null);
 await w.review({kind:'publish'});await w.confirm();assert.equal(f.calls(),1);
});
test('lost response never retries or infers success from explicit refresh',async()=>{
 const f=fixture();const w=createInventoryPublicationWorkspace(f.port);await w.review({kind:'publish'});f.lose();await assert.rejects(w.confirm());
 assert.equal(f.calls(),1);assert.equal(w.snapshot().outcome,'unknown');assert.equal(w.snapshot().review,null);await assert.rejects(w.confirm());
 await w.refresh();assert.equal(w.snapshot().state!.publication!.visible,true);assert.equal(w.snapshot().outcome,'unknown');assert.equal(f.calls(),1);
});
test('denial hides all private state and reviewed intent',async()=>{
 const f=fixture();const w=createInventoryPublicationWorkspace(f.port);await w.review({kind:'publish'});f.deny();await assert.rejects(w.confirm());assert.equal(w.snapshot().state,null);assert.equal(w.snapshot().review,null);assert.equal(w.snapshot().failure,'denied');assert.equal(f.calls(),0);
});
for(const leave of ['account','record','dispose'] as const)test(`${leave} invalidation suppresses late reads and commands`,async()=>{
 const f=fixture();const w=createInventoryPublicationWorkspace(f.port);let release!:()=>void;let started!:()=>void;const entered=new Promise<void>(r=>{started=r;});const get=f.port.get;
 f.port.get=async()=>{started();await new Promise<void>(r=>{release=r;});return get();};
 const reviewing=w.review({kind:'publish'});const rejection=assert.rejects(reviewing);await entered;
 if(leave==='account')f.leave();if(leave==='record')f.switchRecord();if(leave==='dispose')w.dispose();release();await rejection;
 assert.equal(w.snapshot().state,null);assert.equal(w.snapshot().review,null);await assert.rejects(w.confirm());assert.equal(f.calls(),0);
});
test('foreign state from a miswired port fails closed',async()=>{
 const f=fixture();f.port.get=async()=>({...f.state(),record:{...f.state().record,dealer_id:'other'}});const w=createInventoryPublicationWorkspace(f.port);await assert.rejects(w.review({kind:'publish'}));assert.equal(w.snapshot().state,null);assert.equal(f.calls(),0);
});
test('cancel clears review without dispatch, and subscriptions cannot mutate it',async()=>{
 const f=fixture();const w=createInventoryPublicationWorkspace(f.port);w.subscribe(s=>{if(s.review)s.review.state.title='Injected';});await w.review({kind:'publish'});assert.equal(w.snapshot().review!.state.title,'Private');w.cancel();assert.equal(w.snapshot().review,null);await assert.rejects(w.confirm());assert.equal(f.calls(),0);
});
test('settled notification cannot overwrite a new review with previous command success',async()=>{
 const f=fixture();const w=createInventoryPublicationWorkspace(f.port);await w.review({kind:'publish'});let next:Promise<void>|undefined;
 w.subscribe(s=>{if(!s.busy&&s.outcome==='succeeded'&&!next){next=Promise.resolve();next=w.review({kind:'unpublish'});}});
 await w.confirm();await next;assert.equal(w.snapshot().outcome,'none');assert.equal(w.snapshot().review!.command.kind,'unpublish');
});
test('disposal during a committed command hides late state and success',async()=>{
 const f=fixture();const w=createInventoryPublicationWorkspace(f.port);await w.review({kind:'publish'});let release!:()=>void;let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});const execute=f.port.execute;
 f.port.execute=async(...args)=>{const result=await execute(...args);entered();await new Promise<void>(r=>{release=r;});return result;};
 const confirming=w.confirm();const rejection=assert.rejects(confirming);await started;w.dispose();release();await rejection;assert.equal(w.snapshot().state,null);assert.equal(w.snapshot().outcome,'none');assert.equal(f.calls(),1);
});

test('real editor autosave and durable recovery compose with publication review',async()=>{
 const {createInventoryWorkspace}=await import('./inventory-workspace.js');
 const {createInventoryRecoveryJournal}=await import('./inventory-recovery.js');
 type RecordState={id:string;dealer_id:string;revision:number;status:string;attributes:{title:string}};
 const initial:RecordState={id:'p',dealer_id:'d',revision:1,status:'available',attributes:{title:'Original'}};
 type Checkpoint=import('./inventory-editor.js').InventoryEditorCheckpoint<RecordState['attributes'],RecordState>;
 let remote=structuredClone(initial);let stored:string|null=null;let publishes=0;
 const journal=createInventoryRecoveryJournal<Checkpoint>({scope:{userID:'u',dealerID:'d',recordID:'p'},now:()=>1000,validate:(v):v is Checkpoint=>!!v,storage:{read:async()=>stored,write:async(_,v)=>{stored=v;},remove:async()=>{stored=null;}}});
 const editor=createInventoryWorkspace({active:()=>true,initial,journal,copy:a=>({...a}),equal:(a,b)=>a.title===b.title,valid:a=>!!a.title,schedule:()=>()=>{},classify:()=> 'uncertain',get:async()=>structuredClone(remote),edit:async(attributes,revision)=>{assert.equal(revision,remote.revision);remote={...remote,attributes:{...attributes},revision:revision+1};return structuredClone(remote);}});
 const publication=createInventoryPublicationWorkspace({userID:'u',dealerID:'d',recordID:'p',active:()=>true,copy:(s:{record:RecordState})=>structuredClone(s),withMutation:work=>editor.withMediaMutation(work),get:async()=>({record:structuredClone(remote)}),execute:async(_command,revision)=>{assert.equal(revision,remote.revision);publishes++;remote={...remote,revision:revision+1};return {record:structuredClone(remote)};},classify:()=> 'uncertain'});
 editor.change({title:'Reviewed title'});await publication.review({kind:'publish'});assert.equal(publication.snapshot().review!.state.record.attributes.title,'Reviewed title');
 editor.change({title:'Later title'});await assert.rejects(publication.confirm());assert.equal(publishes,0);assert.equal(publication.snapshot().failure,'conflict');assert.equal(remote.attributes.title,'Later title');
 await publication.review({kind:'publish'});await publication.confirm();assert.equal(publishes,1);assert.equal(editor.snapshot().baseline!.revision,remote.revision);assert.equal((await journal.load())!.baseline.revision,remote.revision);publication.dispose();editor.dispose();
});
for(const invalidation of ['dispose','account'] as const)test(`observer ${invalidation} before dispatch prevents command`,async()=>{
 const f=fixture();const w=createInventoryPublicationWorkspace(f.port);await w.review({kind:'publish'});
 w.subscribe(s=>{if(s.busy&&s.outcome==='unknown'){if(invalidation==='dispose')w.dispose();else f.leave();}});
 await assert.rejects(w.confirm());assert.equal(f.calls(),0);assert.equal(w.snapshot().state,null);
});
