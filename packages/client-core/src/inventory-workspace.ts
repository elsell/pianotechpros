import {createInventoryEditor, type InventoryEditorRecord, type InventoryEditorCheckpoint, type InventoryEditorState} from './inventory-editor';
export type InventoryWorkspaceState<A,R> = InventoryEditorState<A,R> & {recovery:'writing'|'ready'|'failed';restored:boolean;invalid:boolean};
/** Durable existing-record composition. Scheduling and storage are injected platform ports. */
export function createInventoryWorkspace<A,R extends InventoryEditorRecord<A>>(port:{
 active?():boolean;initial:R;recovery?:InventoryEditorCheckpoint<A,R>;copy(a:A):A;equal(a:A,b:A):boolean;valid(a:A):boolean;
 edit(a:A,revision:number):Promise<R>;get():Promise<R>;
 classify(error:unknown):'denied'|'conflict'|'rejected'|'uncertain';
 journal:{save(value:InventoryEditorCheckpoint<A,R>):Promise<void>;discard():Promise<void>};
 schedule(run:()=>void):()=>void;
}){
 let disposed=false;let restored=!!port.recovery;let recovery:'writing'|'ready'|'failed'='writing';
 let signature='';let sequence=0;let persisted:Promise<void>=Promise.resolve();let cancel:(()=>void)|null=null;
 const listeners=new Set<(s:InventoryWorkspaceState<A,R>)=>void>();
 let locked=0;let operations:Promise<unknown>=Promise.resolve();
 const alive=()=>!disposed&&(port.active?.()??true);
 const requireAlive=()=>{if(!alive())throw new Error('inventory_workspace_inactive');};
 const editor=createInventoryEditor({...port,persistAttempt:port.journal.save,
  get:async()=>{requireAlive();const value=await port.get();requireAlive();return value;},
  edit:async(a,revision)=>{requireAlive();const value=await port.edit(a,revision);requireAlive();return value;},
 });
 function snapshot():InventoryWorkspaceState<A,R>{const state=editor.snapshot();if(!alive())return {...state,baseline:null,draft:null,latest:null,dirty:false,busy:false,recovery,restored,invalid:false};return {...state,busy:state.busy||locked>0,recovery,restored,invalid:state.draft!==null&&!port.valid(state.draft)};}
 function notify(){if(!disposed)for(const listener of listeners)listener(snapshot());}
 function unschedule(){cancel?.();cancel=null;}
 function schedule(){
  unschedule();if(!alive()||locked)return;
  const s=snapshot();if(s.dirty&&!s.busy&&!s.uncertain&&!s.conflict&&!s.denied&&!s.failure&&!s.invalid&&!s.restored&&s.recovery==='ready')cancel=port.schedule(()=>{cancel=null;void enqueue(async()=>{if(alive()){await editor.save();await flush();}}).catch(()=>{});});
 }
 function persist(checkpoint:InventoryEditorCheckpoint<A,R>){
  const version=++sequence;recovery='writing';
  persisted=port.journal.save(checkpoint).then(()=>{if(!disposed&&version===sequence){recovery='ready';notify();schedule();}},()=>{if(!disposed&&version===sequence){recovery='failed';notify();schedule();}});
 }
 const unsubscribe=editor.subscribe(state=>{
  if(disposed)return;
  if(state.denied){
   if(signature!=='denied'){signature='denied';const version=++sequence;recovery='writing';persisted=port.journal.discard().then(()=>{if(!disposed&&version===sequence){recovery='ready';notify();}},()=>{if(!disposed&&version===sequence){recovery='failed';notify();}});}
  }else{
   const checkpoint=editor.checkpoint();if(checkpoint){const next=JSON.stringify(checkpoint);if(signature!==next){signature=next;persist(checkpoint);}}
  }
  notify();schedule();
 });
 async function flush(){
  // Follow replacements queued while an earlier write was in flight.
  for(;;){const pending=persisted;await pending;if(pending===persisted)break;}
  return !disposed&&recovery==='ready';
 }
 function enqueue<T>(work:()=>Promise<T>):Promise<T>{
  locked++;unschedule();notify();
  const operation=operations.then(work);
  const result=operation.finally(()=>{locked--;notify();schedule();});
  operations=result.catch(()=>{});return result;
 }
 async function save(){
  if(!alive())return;
  const checkpoint=editor.checkpoint();if(!checkpoint)return;
  restored=false;persist(checkpoint);notify();if(!await flush()||!alive())return;
  if(!snapshot().invalid)await editor.save();await flush();
 }
 async function protect(){
  const checkpoint=editor.checkpoint();if(!checkpoint||!alive())return false;
  persist(checkpoint);notify();return flush();
 }
 function mediaReady(){
  const s=editor.snapshot();
  if(!alive()||!s.baseline||s.denied||s.uncertain||s.conflict||s.failure||recovery!=='ready')throw new Error('inventory_media_unavailable');
  return s.baseline;
 }
 return Object.freeze({
  snapshot,
  subscribe(listener:(s:InventoryWorkspaceState<A,R>)=>void){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  change(input:A){if(!alive())return;editor.change(input);},
  save(){return enqueue(save);},
  recover(){return enqueue(async()=>{if(alive()){await editor.recover();await flush();}});},
  refresh(){return enqueue(async()=>{if(alive()){await editor.refresh();await flush();}});},
  withMediaMutation<T>(work:(baseline:R)=>Promise<T>):Promise<T>{
   return enqueue(async()=>{
    if(!await protect())throw new Error('inventory_media_unavailable');
    mediaReady();
    if(!restored&&!snapshot().invalid)await save();
    mediaReady();await editor.refresh();await flush();const baseline=mediaReady();
    let result:T;
    try{result=await work(baseline);}
    finally{if(alive()){await editor.refresh();await flush();}}
    requireAlive();return result;
   });
  },
  drain(){return operations.then(()=>{});},
  keepEdits(){if(!alive())return;restored=false;editor.keepEdits();},
  useLatest(){if(!alive())return;restored=false;editor.useLatest();},
  protect,
  flush,
  dispose(){if(disposed)return;disposed=true;cancel?.();cancel=null;unsubscribe();editor.dispose();signature='';listeners.clear();},
 });
}
