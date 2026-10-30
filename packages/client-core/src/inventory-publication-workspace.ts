export type PublicationMissingField = 'form'|'condition'|'title'|'photo';
export type PublicationCommand = {kind:'publish'} | {kind:'unpublish'} | {kind:'transition';status:'draft'|'available'|'reserved'|'in_service'|'sold'|'archived';salePrice:{minor_units:number;currency:string}|null;reason:string};
export interface PublicationReviewState {record:{id:string;dealer_id:string;revision:number;status:string}}
export type PublicationReviewFailure = 'denied'|'conflict'|'rejected'|'uncertain';
export interface InventoryPublicationWorkspacePort<S extends PublicationReviewState> {
 userID:string;dealerID:string;recordID:string;active():boolean;
 copy(state:S):S;
 withMutation<T>(work:()=>Promise<T>):Promise<T>;
 get():Promise<S>;
 missing?(state:S):readonly PublicationMissingField[];
 execute(command:PublicationCommand,expectedRevision:number):Promise<S>;
 classify(error:unknown):PublicationReviewFailure;
}
const unavailable=()=>new Error('inventory_publication_unavailable');
const copyCommand=(command:PublicationCommand):PublicationCommand=>command.kind==='transition'?{kind:'transition',status:command.status,salePrice:command.salePrice?{...command.salePrice}:null,reason:command.reason}:{kind:command.kind};
/** A review is ephemeral and single-use. Ports serialize with editor saves and validate transport. */
export function createInventoryPublicationWorkspace<S extends PublicationReviewState>(port:InventoryPublicationWorkspacePort<S>){
 let disposed=false;let busy=false;let state:S|null=null;let review:{command:PublicationCommand;state:S}|null=null;
 let missing:PublicationMissingField[]=[];
 let failure:PublicationReviewFailure|null=null;let outcome:'none'|'succeeded'|'unknown'='none';
 const listeners=new Set<(value:ReturnType<typeof snapshot>)=>void>();
 const alive=()=>!disposed&&port.active();
 function active(){if(!alive())throw unavailable();}
 function snapshot(){const visible=alive()&&failure!=='denied';return {
  state:visible&&state?port.copy(state):null,
  review:visible&&review?{command:copyCommand(review.command),state:port.copy(review.state)}:null,
  missing:visible?[...missing]:[],
  busy:alive()&&busy,failure:alive()?failure:null,outcome:alive()?outcome:'none' as const,
 };}
 function notify(){if(!disposed)for(const listener of listeners){try{listener(snapshot());}catch{/* Presentation cannot interrupt a command. */}}}
 function check(value:S):S{
  active();if(value.record.id!==port.recordID||value.record.dealer_id!==port.dealerID||!Number.isSafeInteger(value.record.revision)||value.record.revision<1)throw unavailable();return port.copy(value);
 }
 async function run(work:()=>Promise<void>,settle?:(success:boolean)=>void){
  if(busy||!alive())throw unavailable();busy=true;failure=null;notify();
  try{await port.withMutation(async()=>{active();await work();active();});active();settle?.(true);}
  catch(error){review=null;if(alive()){failure=failure??port.classify(error);if(failure==='denied')state=null;}settle?.(false);throw unavailable();}
  finally{busy=false;notify();}
 }
 return Object.freeze({
  snapshot,
  subscribe(listener:(value:ReturnType<typeof snapshot>)=>void){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  refresh(){return run(async()=>{review=null;missing=[];state=check(await port.get());});},
  review(command:PublicationCommand){
   const intent=copyCommand(command);
   return run(async()=>{review=null;missing=[];outcome='none';state=check(await port.get());
    if(intent.kind==='publish'){const fields=port.missing?.(port.copy(state))??[];active();
     if(fields.some(field=>!['form','condition','title','photo'].includes(field)))throw unavailable();
     missing=[...new Set(fields)];if(missing.length)return;
    }
    review={command:intent,state:port.copy(state)};});
  },
  confirm(){
   if(busy||!alive()||!review)return Promise.reject(unavailable());
   const intent=review;review=null;let attempted=false;
   return run(async()=>{
    state=check(await port.get());
    if(state.record.revision!==intent.state.record.revision){failure='conflict';throw unavailable();}
    active();outcome='unknown';notify();active();attempted=true;
    const result=check(await port.execute(copyCommand(intent.command),intent.state.record.revision));
    if(result.record.revision!==intent.state.record.revision+1){failure='uncertain';throw unavailable();}
    state=result;
   },success=>{outcome=success?'succeeded':attempted&&failure==='uncertain'?'unknown':'none';});
  },
  cancel(){if(!busy){review=null;missing=[];notify();}},
  dispose(){disposed=true;state=null;review=null;missing=[];listeners.clear();},
 });
}
