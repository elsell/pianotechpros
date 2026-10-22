export interface InventoryEditorRecord<A> { id: string; dealer_id: string; revision: number; attributes: A }
export interface InventoryEditorCheckpoint<A,R> {version:1;baseline:R;draft:A;pending:{attributes:A;revision:number}|null;conflict:boolean}
export interface InventoryEditorState<A,R> {
 baseline:R|null; draft:A|null; latest:R|null; dirty:boolean; busy:boolean;
 uncertain:boolean; conflict:boolean; denied:boolean; failure:unknown;
}
export function createInventoryEditor<A,R extends InventoryEditorRecord<A>>(port:{
 initial:R; recovery?:InventoryEditorCheckpoint<A,R>; copy(input:A):A; equal(a:A,b:A):boolean;
 edit(attributes:A,revision:number):Promise<R>;get():Promise<R>;
 classify(error:unknown):'denied'|'conflict'|'rejected'|'uncertain';
}){
 const copyRecord=(r:R):R=>({...r,attributes:port.copy(r.attributes)});
 const identity={id:port.initial.id,dealer:port.initial.dealer_id};
 let disposed=false;let pending:{attributes:A;revision:number}|null=null;
 let state:InventoryEditorState<A,R>={baseline:copyRecord(port.initial),draft:port.copy(port.initial.attributes),latest:null,dirty:false,busy:false,uncertain:false,conflict:false,denied:false,failure:null};
 if(port.recovery){
  const saved=port.recovery;
  if(saved.version!==1||saved.baseline.id!==identity.id||saved.baseline.dealer_id!==identity.dealer||!Number.isSafeInteger(saved.baseline.revision)||saved.baseline.revision<1||typeof saved.conflict!=='boolean'||saved.pending&&saved.pending.revision!==saved.baseline.revision)throw new Error('invalid_inventory_checkpoint');
  pending=saved.pending?{attributes:port.copy(saved.pending.attributes),revision:saved.pending.revision}:null;
  state={...state,baseline:copyRecord(saved.baseline),draft:port.copy(saved.draft),uncertain:pending!==null,conflict:saved.conflict||(!pending&&port.initial.revision>saved.baseline.revision),dirty:!port.equal(saved.baseline.attributes,saved.draft)};
 }
 const listeners=new Set<(s:InventoryEditorState<A,R>)=>void>();
 function snapshot():InventoryEditorState<A,R>{return {...state,baseline:state.baseline&&copyRecord(state.baseline),draft:state.draft===null?null:port.copy(state.draft),latest:state.latest&&copyRecord(state.latest)};}
 function publish(patch:Partial<InventoryEditorState<A,R>>){if(disposed)return;state={...state,...patch};state.dirty=state.baseline!==null&&state.draft!==null&&!port.equal(state.baseline.attributes,state.draft);for(const listener of listeners)listener(snapshot());}
 function clear(denied:boolean){pending=null;state={baseline:null,draft:null,latest:null,dirty:false,busy:false,uncertain:false,conflict:false,denied,failure:null};}
 function valid(record:R,min:number){return record.id===identity.id&&record.dealer_id===identity.dealer&&Number.isSafeInteger(record.revision)&&record.revision>=min;}
 function failure(error:unknown,write:boolean){
  const kind=port.classify(error);
  if(kind==='denied'){clear(true);publish({});return;}
  if(write&&kind==='rejected')pending=null;
  publish({failure:error,latest:null,conflict:state.conflict||kind==='conflict',uncertain:write?kind==='uncertain':state.uncertain});
 }
 function accept(record:R){pending=null;publish({baseline:copyRecord(record),latest:null,uncertain:false,conflict:false,failure:null});}
 return Object.freeze({
  snapshot,
  checkpoint():InventoryEditorCheckpoint<A,R>|null{
   if(disposed||state.denied||!state.baseline||state.draft===null)return null;
   return {version:1,baseline:copyRecord(state.baseline),draft:port.copy(state.draft),pending:pending?{attributes:port.copy(pending.attributes),revision:pending.revision}:null,conflict:state.conflict};
  },
  subscribe(listener:(s:InventoryEditorState<A,R>)=>void){if(disposed){listener(snapshot());return ()=>{};}listeners.add(listener);listener(snapshot());return ()=>{listeners.delete(listener);};},
  change(input:A){if(disposed||state.denied||!state.baseline)return;publish({draft:port.copy(input),failure:null});},
  async save(){
   if(disposed||state.denied||state.busy||state.conflict||!state.baseline||state.draft===null||(!state.dirty&&!pending))return;
   pending??={attributes:port.copy(state.draft),revision:state.baseline.revision};const attempt=pending;
   publish({busy:true,failure:null});
   try{const result=await port.edit(port.copy(attempt.attributes),attempt.revision);if(disposed||state.denied)return;if(!valid(result,attempt.revision+1)||result.revision!==attempt.revision+1)throw new Error('invalid_inventory_revision');
    // Preserve subsequent typing; when unchanged locally adopt server normalization.
    const unchanged=state.draft!==null&&port.equal(state.draft,attempt.attributes);if(unchanged)publish({draft:port.copy(result.attributes)});accept(result);
   }catch(error){if(!disposed)failure(error,true);}finally{publish({busy:false});}
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
export function isInventoryEditorCheckpoint<A,R extends InventoryEditorRecord<A>>(value:unknown,scope:{dealerID:string;recordID:string},attributes:(value:unknown)=>value is A,record:(value:unknown)=>value is R):value is InventoryEditorCheckpoint<A,R>{
 if(!value||typeof value!=='object')return false;
 const c=value as Partial<InventoryEditorCheckpoint<A,R>>;
 if(c.version!==1||typeof c.conflict!=='boolean'||!record(c.baseline)||c.baseline.id!==scope.recordID||c.baseline.dealer_id!==scope.dealerID||!Number.isSafeInteger(c.baseline.revision)||c.baseline.revision<1||!attributes(c.draft))return false;
 return c.pending===null||!!c.pending&&typeof c.pending==='object'&&c.pending.revision===c.baseline.revision&&attributes(c.pending.attributes);
}
