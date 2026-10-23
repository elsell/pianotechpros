import {createInventoryEditor, type InventoryEditorRecord, type InventoryEditorCheckpoint, type InventoryEditorState} from './inventory-editor';
export type InventoryWorkspaceState<A,R> = InventoryEditorState<A,R> & {recovery:'writing'|'ready'|'failed';restored:boolean;invalid:boolean};
/** Durable existing-record composition. Scheduling and storage are injected platform ports. */
export function createInventoryWorkspace<A,R extends InventoryEditorRecord<A>>(port:{
 initial:R;recovery?:InventoryEditorCheckpoint<A,R>;copy(a:A):A;equal(a:A,b:A):boolean;valid(a:A):boolean;
 edit(a:A,revision:number):Promise<R>;get():Promise<R>;
 classify(error:unknown):'denied'|'conflict'|'rejected'|'uncertain';
 journal:{save(value:InventoryEditorCheckpoint<A,R>):Promise<void>;discard():Promise<void>};
 schedule(run:()=>void):()=>void;
}){
 let disposed=false;let restored=!!port.recovery;let recovery:'writing'|'ready'|'failed'='writing';
 let signature='';let sequence=0;let persisted:Promise<void>=Promise.resolve();let cancel:(()=>void)|null=null;
 const listeners=new Set<(s:InventoryWorkspaceState<A,R>)=>void>();
 const editor=createInventoryEditor({...port,persistAttempt:port.journal.save});
 function snapshot():InventoryWorkspaceState<A,R>{const state=editor.snapshot();return {...state,recovery,restored,invalid:state.draft!==null&&!port.valid(state.draft)};}
 function notify(){if(!disposed)for(const listener of listeners)listener(snapshot());}
 function unschedule(){cancel?.();cancel=null;}
 function schedule(){
  unschedule();if(disposed)return;
  const s=snapshot();if(s.dirty&&!s.busy&&!s.uncertain&&!s.conflict&&!s.denied&&!s.failure&&!s.invalid&&!s.restored&&s.recovery==='ready')cancel=port.schedule(()=>{cancel=null;void editor.save();});
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
 return Object.freeze({
  snapshot,
  subscribe(listener:(s:InventoryWorkspaceState<A,R>)=>void){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  change(input:A){if(disposed)return;editor.change(input);},
  async save(){
   unschedule();if(disposed)return;
   const checkpoint=editor.checkpoint();if(!checkpoint)return;
   // Explicit retry also repairs a failed local checkpoint before a remote attempt.
   restored=false;persist(checkpoint);notify();if(!await flush())return;
   unschedule();
   const s=snapshot();if(!s.invalid)await editor.save();
   await flush();
  },
  async recover(){if(disposed)return;await editor.recover();await flush();},
  keepEdits(){if(disposed)return;restored=false;editor.keepEdits();},
  useLatest(){if(disposed)return;restored=false;editor.useLatest();},
  flush,
  dispose(){if(disposed)return;disposed=true;cancel?.();cancel=null;unsubscribe();editor.dispose();signature='';listeners.clear();},
 });
}
