export type InquiryWorkspaceIssue='unauthenticated'|'not_found'|'conflict'|'rate_limited'|'unavailable'|'network'|'protocol_error'|'invalid_input'|'challenge_rejected';
export interface InquiryWorkspacePort<T>{list(cursor:string|undefined,signal:AbortSignal):Promise<{inquiries:T[];nextCursor?:string}>;get(id:string,signal:AbortSignal):Promise<T>;markRead(id:string,revision:number,signal:AbortSignal):Promise<T>;}
export type InquiryWorkspaceState<T>={accountID:string|null;dealerID:string|null;items:T[];nextCursor?:string;listBusy:boolean;listIssue:InquiryWorkspaceIssue|null;listOperation:'refresh'|'more'|null;selectedID:string|null;selected:T|null;detailBusy:boolean;detailIssue:InquiryWorkspaceIssue|null;markBusy:boolean};
/** Only validated JSON DTOs enter this account/dealer-scoped, memory-only workspace. */
export function createInquiryWorkspace<T extends {id:string;revision:number}>(classify:(error:unknown)=>InquiryWorkspaceIssue){
 type State=InquiryWorkspaceState<T>;
 const empty=():State=>({accountID:null,dealerID:null,items:[],listBusy:false,listIssue:null,listOperation:null,selectedID:null,selected:null,detailBusy:false,detailIssue:null,markBusy:false});
 let state=empty();let port:InquiryWorkspacePort<T>|null=null;let scope=0;let list:AbortController|null=null;let detail:AbortController|null=null;
 const cursors=new Set<string>();const listeners=new Set<(state:State)=>void>();
 const copy=<V>(value:V):V=>JSON.parse(JSON.stringify(value)) as V;
 const snapshot=()=>copy(state);
 function publish(patch:Partial<State>){state={...state,...patch};for(const listener of listeners)listener(snapshot());}
 function reset(accountID:string|null,dealerID:string|null,next:InquiryWorkspacePort<T>|null){scope++;list?.abort();detail?.abort();list=null;detail=null;port=next;cursors.clear();publish({...empty(),accountID,dealerID,nextCursor:undefined});}
 const valid=(value:T,id?:string)=>value&&typeof value.id==='string'&&!!value.id&&(id===undefined||value.id===id)&&(value.revision===1||value.revision===2);
 const newest=(value:T)=>{const prior=state.selected?.id===value.id?state.selected:state.items.find(row=>row.id===value.id);return prior&&prior.revision>value.revision?prior:copy(value);};
 function failure(error:unknown,field:'listIssue'|'detailIssue'){
  const issue=classify(error);
  if(issue==='unauthenticated'||issue==='not_found'){scope++;list?.abort();detail?.abort();list=null;detail=null;cursors.clear();publish({items:[],selected:null,selectedID:null,nextCursor:undefined,listBusy:false,detailBusy:false,markBusy:false,listIssue:null,detailIssue:null,listOperation:'refresh',[field]:issue});}
  else publish({[field]:issue});
 }
 async function page(append:boolean){
  if(!port||list||append&&!state.nextCursor)return;
  const controller=new AbortController();list=controller;const captured=scope;const currentPort=port;const cursor=append?state.nextCursor:undefined;
  const current=()=>scope===captured&&list===controller&&!controller.signal.aborted;
  publish({listBusy:true,listIssue:null,listOperation:append?'more':'refresh'});if(!current())return;
  try{
   const result=await currentPort.list(cursor,controller.signal);if(!current())return;
   const seen=new Set(append?state.items.map(row=>row.id):[]);
   if(!Array.isArray(result.inquiries)||result.inquiries.length>100||result.inquiries.some(row=>{if(!valid(row)||seen.has(row.id))return true;seen.add(row.id);return false;})||result.nextCursor!==undefined&&(typeof result.nextCursor!=='string'||!result.nextCursor||!result.inquiries.length||result.nextCursor===cursor||append&&cursors.has(result.nextCursor))){publish({listIssue:'protocol_error'});return;}
   const rows=result.inquiries.map(newest);if(!append)cursors.clear();if(cursor)cursors.add(cursor);
   publish({items:append?[...state.items,...rows]:rows,nextCursor:result.nextCursor});
  }catch(error){if(current())failure(error,'listIssue');}
  finally{if(current()){list=null;publish({listBusy:false});}}
 }
 async function select(id:string|null){
  detail?.abort();detail=null;const controller=new AbortController();detail=controller;const captured=scope;const currentPort=port;
  const current=()=>scope===captured&&detail===controller&&!controller.signal.aborted;
  publish({selectedID:currentPort?id:null,selected:null,detailBusy:!!currentPort&&!!id,detailIssue:null,markBusy:false});
  if(!current())return;if(!currentPort||!id){detail=null;return;}
  try{const value=await currentPort.get(id,controller.signal);if(!current())return;if(!valid(value,id)){publish({detailIssue:'protocol_error'});return;}const row=newest(value);publish({selected:row,items:state.items.map(item=>item.id===id?row:item)});}
  catch(error){if(current())failure(error,'detailIssue');}
  finally{if(current()){detail=null;publish({detailBusy:false});}}
 }
 return {
  snapshot,subscribe(listener:(state:State)=>void){listeners.add(listener);listener(snapshot());return ()=>{listeners.delete(listener);};},
  replaceScope(accountID:string,dealerID:string,next:InquiryWorkspacePort<T>){if(!accountID.trim()||!dealerID.trim())throw new Error('inquiry_scope_required');reset(accountID,dealerID,next);},
  clear(){reset(null,null,null);},refresh(){return page(false);},loadMore(){return page(true);},select,
  async markRead(){
   if(!port||detail||!state.selected||state.selected.revision!==1)return;
   const row=state.selected;const currentPort=port;const captured=scope;const controller=new AbortController();detail=controller;
   const current=()=>scope===captured&&detail===controller&&!controller.signal.aborted;
   publish({markBusy:true,detailIssue:null});if(!current())return;
   try{const result=await currentPort.markRead(row.id,row.revision,controller.signal);if(!current())return;if(!valid(result,row.id)||result.revision!==2){publish({detailIssue:'protocol_error'});return;}const updated=copy(result);publish({selected:updated,items:state.items.map(item=>item.id===row.id?updated:item)});}
   catch(error){if(current()){if(classify(error)==='conflict'){await select(row.id);}else failure(error,'detailIssue');}}
   finally{if(current()){detail=null;publish({markBusy:false});}}
  },
 };
}
