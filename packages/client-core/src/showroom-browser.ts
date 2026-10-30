import {createPublicResource} from './public-resource';
import {showroomFilters,type ShowroomFilterFields} from './showroom-browse';
type Query=ReturnType<typeof showroomFilters>;
type Page<P,S>={profile:S;pianos:P[];nextCursor?:string};
export function createShowroomBrowser<P extends {id:string;dealer_id:string},S extends {id:string;slug:string}>(slug:string,decimal:'.'|',',load:(query:Query,signal:AbortSignal)=>Promise<Page<P,S>>){
 let fields:ShowroomFilterFields={},query:Query={limit:12},invalid=false,prior:Page<P,S>|null=null;
 let cursors=new Set<string>();
 const resource=createPublicResource(async signal=>{
  const previous=prior,request={...query};const result=await load(request,signal);
  if(signal.aborted)throw Error('cancelled');
  if(result.profile.slug!==slug||previous&&previous.profile.id!==result.profile.id||result.nextCursor&&cursors.has(result.nextCursor))throw Error('invalid_public_page');
  const ids=new Set(previous?.pianos.map(p=>p.id));
  for(const piano of result.pianos){if(piano.dealer_id!==result.profile.id||ids.has(piano.id))throw Error('invalid_public_page');ids.add(piano.id);}
  if(result.nextCursor)cursors.add(result.nextCursor);
  return {...result,pianos:[...(previous?.pianos??[]),...result.pianos]};
 });
 const snapshot=()=>({...resource.snapshot(),fields:{...fields},invalid});
 async function filter(input:ShowroomFilterFields){
  fields={...input};delete fields.cursor;invalid=false;prior=null;cursors=new Set();
  try{query=showroomFilters(fields,decimal);}catch{invalid=true;resource.clear();return;}
  await resource.refresh();
 }
 return Object.freeze({snapshot,filter,refresh:()=>filter(fields),
  async more(){const state=resource.snapshot();if(state.loading||!state.value?.nextCursor)return;prior=state.value;query={...query,cursor:state.value.nextCursor};await resource.refresh(true);},
  clear(){prior=null;cursors=new Set();resource.clear();},
  subscribe(listener:(state:ReturnType<typeof snapshot>)=>void){return resource.subscribe(()=>listener(snapshot()));},dispose(){prior=null;resource.dispose();},
 });
}
