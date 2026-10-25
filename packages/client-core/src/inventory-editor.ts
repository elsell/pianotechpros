export interface InventoryEditorRecord<A> { id: string; dealer_id: string; revision: number; attributes: A }
export interface InventoryEditorCheckpoint<A,R> {version:1;baseline:R;draft:A;pending:{attributes:A;revision:number;voiceFields?:string[]}|null;conflict:boolean;voiceFields?:string[]}
export interface InventoryEditorState<A,R> {
 baseline:R|null; draft:A|null; latest:R|null; dirty:boolean; busy:boolean;
 uncertain:boolean; conflict:boolean; denied:boolean; failure:unknown;
}
export interface InventoryAttributionPolicy<A>{fields:readonly string[];changed(a:A,b:A):readonly string[];saving?(a:A,b:A):readonly string[]}
function validVoiceFields(value:unknown,allowed:readonly string[]):value is string[]|undefined{return value===undefined||Array.isArray(value)&&value.length<=18&&new Set(value).size===value.length&&value.every(field=>typeof field==='string'&&allowed.includes(field));}
const attribution=(fields:readonly string[])=>fields.length?{voiceFields:[...fields]}:{};
export function createInventoryEditor<A,R extends InventoryEditorRecord<A>>(port:{
 initial:R; recovery?:InventoryEditorCheckpoint<A,R>; copy(input:A):A; equal(a:A,b:A):boolean;
 attribution?:InventoryAttributionPolicy<A>;
 edit(attributes:A,revision:number,voiceFields?:readonly string[]):Promise<R>;get():Promise<R>;
 persistAttempt?(checkpoint:InventoryEditorCheckpoint<A,R>):Promise<void>;
 classify(error:unknown):'denied'|'conflict'|'rejected'|'uncertain';
}){
 const copyRecord=(r:R):R=>({...r,attributes:port.copy(r.attributes)});
 const identity={id:port.initial.id,dealer:port.initial.dealer_id};
 const allowed=[...(port.attribution?.fields??[])];
 if(allowed.length>18||new Set(allowed).size!==allowed.length)throw new Error('invalid_inventory_attribution_policy');
 const changed=(a:A,b:A)=>port.attribution?.changed(a,b)??[];
 const saving=(a:A,b:A)=>port.attribution?.saving?.(a,b)??changed(a,b);
 let voiceFields:string[]=[];
 const copyAttempt=(value:{attributes:A;revision:number;voiceFields?:string[]})=>({attributes:port.copy(value.attributes),revision:value.revision,...attribution(value.voiceFields??[])});
 let disposed=false;let pending:{attributes:A;revision:number;voiceFields?:string[]}|null=null;
 let state:InventoryEditorState<A,R>={baseline:copyRecord(port.initial),draft:port.copy(port.initial.attributes),latest:null,dirty:false,busy:false,uncertain:false,conflict:false,denied:false,failure:null};
 if(port.recovery){
  const saved=port.recovery;
  if(saved.version!==1||saved.baseline.id!==identity.id||saved.baseline.dealer_id!==identity.dealer||!Number.isSafeInteger(saved.baseline.revision)||saved.baseline.revision<1||typeof saved.conflict!=='boolean'||saved.pending&&saved.pending.revision!==saved.baseline.revision)throw new Error('invalid_inventory_checkpoint');
  if(!validVoiceFields(saved.voiceFields,allowed)||!validVoiceFields(saved.pending?.voiceFields,allowed)||saved.voiceFields?.some(field=>!changed(saved.baseline.attributes,saved.draft).includes(field)&&(!saved.pending||!changed(saved.pending.attributes,saved.draft).includes(field)))||saved.pending?.voiceFields?.some(field=>!saving(saved.baseline.attributes,saved.pending!.attributes).includes(field)))throw new Error('invalid_inventory_checkpoint');
  voiceFields=[...(saved.voiceFields??[])];
  const revisionOnly=!saved.pending&&!saved.conflict&&port.initial.revision>=saved.baseline.revision&&port.equal(port.initial.attributes,saved.baseline.attributes);
  pending=saved.pending?copyAttempt(saved.pending):null;
  state={...state,baseline:copyRecord(revisionOnly?port.initial:saved.baseline),draft:port.copy(saved.draft),uncertain:pending!==null,conflict:saved.conflict||(!revisionOnly&&!pending&&port.initial.revision>saved.baseline.revision),dirty:!port.equal(saved.baseline.attributes,saved.draft)};
 }
 const listeners=new Set<(s:InventoryEditorState<A,R>)=>void>();
 function snapshot():InventoryEditorState<A,R>{return {...state,baseline:state.baseline&&copyRecord(state.baseline),draft:state.draft===null?null:port.copy(state.draft),latest:state.latest&&copyRecord(state.latest)};}
 function publish(patch:Partial<InventoryEditorState<A,R>>){if(disposed)return;state={...state,...patch};voiceFields=voiceFields.filter(field=>state.baseline!==null&&state.draft!==null&&(changed(state.baseline.attributes,state.draft).includes(field)||pending!==null&&changed(pending.attributes,state.draft).includes(field)));state.dirty=state.baseline!==null&&state.draft!==null&&!port.equal(state.baseline.attributes,state.draft);for(const listener of listeners)listener(snapshot());}
 function clear(denied:boolean){pending=null;voiceFields=[];state={baseline:null,draft:null,latest:null,dirty:false,busy:false,uncertain:false,conflict:false,denied,failure:null};}
 function valid(record:R,min:number){return record.id===identity.id&&record.dealer_id===identity.dealer&&Number.isSafeInteger(record.revision)&&record.revision>=min;}
 function failure(error:unknown,write:boolean){
  const kind=port.classify(error);
  if(kind==='denied'){clear(true);publish({});return;}
  if(write&&kind==='rejected')pending=null;
  publish({failure:error,latest:null,conflict:state.conflict||kind==='conflict',uncertain:write?kind==='uncertain':state.uncertain});
 }
 function accept(record:R){pending=null;publish({baseline:copyRecord(record),latest:null,uncertain:false,conflict:false,failure:null});}
 function checkpoint():InventoryEditorCheckpoint<A,R>|null{
   if(disposed||state.denied||!state.baseline||state.draft===null)return null;
   return {version:1,baseline:copyRecord(state.baseline),draft:port.copy(state.draft),pending:pending?copyAttempt(pending):null,conflict:state.conflict,...attribution(voiceFields)};
  }
 return Object.freeze({
  snapshot,
  checkpoint,
  subscribe(listener:(s:InventoryEditorState<A,R>)=>void){if(disposed){listener(snapshot());return ()=>{};}listeners.add(listener);listener(snapshot());return ()=>{listeners.delete(listener);};},
  change(input:A,acceptedVoiceFields:readonly string[]=[]){
   if(disposed||state.denied||!state.baseline||state.draft===null)return;
   const fields=changed(state.draft,input);
   if(!validVoiceFields(acceptedVoiceFields,allowed)||acceptedVoiceFields.some(field=>!fields.includes(field)))throw new Error('invalid_inventory_attribution');
   voiceFields=[...voiceFields.filter(field=>!fields.includes(field)),...acceptedVoiceFields];
   publish({draft:port.copy(input),failure:null});
  },
  async save(){
   if(disposed||state.denied||state.busy||state.conflict||!state.baseline||state.draft===null||(!state.dirty&&!pending))return;
   const previouslyPending=pending!==null;
   pending??={attributes:port.copy(state.draft),revision:state.baseline.revision,...attribution(voiceFields.filter(field=>saving(state.baseline!.attributes,state.draft!).includes(field)))};const attempt=pending;let sent=false;
   publish({busy:true,failure:null});
   try{
    if(port.persistAttempt){const saved=checkpoint();if(!saved)return;await port.persistAttempt(saved);if(disposed||state.denied)return;}
    sent=true;const result=await port.edit(port.copy(attempt.attributes),attempt.revision,attempt.voiceFields?[...attempt.voiceFields]:undefined);if(disposed||state.denied)return;if(!valid(result,attempt.revision+1)||result.revision!==attempt.revision+1)throw new Error('invalid_inventory_revision');
    // Preserve subsequent typing; when unchanged locally adopt server normalization.
    const unchanged=state.draft!==null&&port.equal(state.draft,attempt.attributes);if(unchanged)publish({draft:port.copy(result.attributes)});accept(result);
   }catch(error){if(!disposed){
    if(sent)failure(error,true);
    else {if(!previouslyPending)pending=null;publish({failure:new Error('inventory_recovery_unavailable')});}
   }}finally{publish({busy:false});}
  },
  async refresh(){
   if(disposed||state.denied||state.busy||state.conflict||pending||!state.baseline)return;
   publish({busy:true,failure:null});
   try{
    const result=await port.get();if(disposed||state.denied)return;
    if(!valid(result,state.baseline!.revision)||result.revision===state.baseline!.revision&&!port.equal(result.attributes,state.baseline!.attributes))throw new Error('invalid_inventory_revision');
    if(port.equal(result.attributes,state.baseline!.attributes)){accept(result);}
    else if(!state.dirty){publish({draft:port.copy(result.attributes)});accept(result);}
    else{publish({latest:copyRecord(result),conflict:true});}
   }catch(error){if(!disposed)failure(error,false);}finally{publish({busy:false});}
  },
  async recover(){
   if(disposed||state.denied||state.busy||!state.baseline||(!state.conflict&&!state.uncertain))return;
   publish({busy:true,failure:null});
   try{const result=await port.get();if(disposed||state.denied)return;if(!valid(result,state.baseline!.revision))throw new Error('invalid_inventory_revision');
    if(pending&&result.revision===pending.revision+1&&port.equal(result.attributes,pending.attributes)){accept(result);}
    else if(pending&&result.revision===pending.revision&&!state.conflict){publish({uncertain:true,latest:null});}
    else{publish({latest:copyRecord(result),conflict:true,uncertain:false});}
   }catch(error){if(!disposed)failure(error,false);}finally{publish({busy:false});}
  },
  keepEdits(){if(disposed||state.denied||state.busy||!state.conflict||!state.latest)return;accept(state.latest);},
  useLatest(){if(disposed||state.denied||state.busy||!state.conflict||!state.latest)return;const latest=state.latest;publish({draft:port.copy(latest.attributes)});accept(latest);},
  dispose(){clear(false);disposed=true;listeners.clear();},
 });
}

/** Validate protected-storage payloads before supplying recovery to a controller. */
export function isInventoryEditorCheckpoint<A,R extends InventoryEditorRecord<A>>(value:unknown,scope:{dealerID:string;recordID:string},attributes:(value:unknown)=>value is A,record:(value:unknown)=>value is R,voiceFields:readonly string[]=[]):value is InventoryEditorCheckpoint<A,R>{
 if(!value||typeof value!=='object')return false;
 const c=value as Partial<InventoryEditorCheckpoint<A,R>>;
 if(c.version!==1||typeof c.conflict!=='boolean'||!record(c.baseline)||c.baseline.id!==scope.recordID||c.baseline.dealer_id!==scope.dealerID||!Number.isSafeInteger(c.baseline.revision)||c.baseline.revision<1||!attributes(c.draft))return false;
 if(!validVoiceFields(c.voiceFields,voiceFields)||!validVoiceFields(c.pending?.voiceFields,voiceFields))return false;
 return c.pending===null||!!c.pending&&typeof c.pending==='object'&&c.pending.revision===c.baseline.revision&&attributes(c.pending.attributes);
}
