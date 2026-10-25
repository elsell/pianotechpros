import {copyTechnicianForm,technicianFormIssues,isTechnicianForm,type TechnicianForm,type TechnicianFormIssue} from './technician-form';
export interface TechnicianEditorRecord {id:string;revision:number;attributes:TechnicianForm}
type Pending={kind:'create';key:string;attributes:TechnicianForm}|{kind:'save';id:string;revision:number;attributes:TechnicianForm};
export interface TechnicianEditorCheckpoint {version:1;baseline:TechnicianEditorRecord|null;draft:TechnicianForm;pending:Pending|null;conflict:boolean}
export interface TechnicianEditorState extends TechnicianEditorCheckpoint {busy:boolean;latest:TechnicianEditorRecord|null;dirty:boolean;failure:null|'storage'|'conflict'|'rejected'|'uncertain';issues:TechnicianFormIssue[]}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const revision=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const record=(v:unknown):v is TechnicianEditorRecord=>object(v)&&exact(v,['id','revision','attributes'])&&id(v.id)&&revision(v.revision)&&isTechnicianForm(v.attributes);
const same=(a:TechnicianForm,b:TechnicianForm)=>JSON.stringify(a)===JSON.stringify(b);
const copyRecord=(r:TechnicianEditorRecord):TechnicianEditorRecord=>({...r,attributes:copyTechnicianForm(r.attributes)});
const copyPending=(p:Pending):Pending=>({...p,attributes:copyTechnicianForm(p.attributes)});
export function isTechnicianEditorCheckpoint(v:unknown,zones:ReadonlySet<string>):v is TechnicianEditorCheckpoint {
 if(!object(v)||!exact(v,['version','baseline','draft','pending','conflict'])||v.version!==1||!isTechnicianForm(v.draft)||typeof v.conflict!=='boolean'||v.baseline!==null&&(!record(v.baseline)||technicianFormIssues(v.baseline.attributes,zones).length>0))return false;
 const p=v.pending;if(p===null)return true;
 if(v.conflict||!object(p)||!isTechnicianForm(p.attributes)||technicianFormIssues(p.attributes,zones).length)return false;
 if(p.kind==='create')return v.baseline===null&&exact(p,['kind','key','attributes'])&&typeof p.key==='string'&&/^[\x21-\x7e]{16,128}$/.test(p.key);
 return p.kind==='save'&&exact(p,['kind','id','revision','attributes'])&&record(v.baseline)&&p.id===v.baseline.id&&p.revision===v.baseline.revision;
}
export function createTechnicianEditor(port:{
 initial:TechnicianEditorRecord|null;draft:TechnicianForm;recovery?:TechnicianEditorCheckpoint;zones:ReadonlySet<string>;
 active():boolean;key():string;persist(checkpoint:TechnicianEditorCheckpoint):Promise<void>;
 create(attributes:TechnicianForm,key:string):Promise<TechnicianEditorRecord>;
 update(id:string,attributes:TechnicianForm,revision:number):Promise<TechnicianEditorRecord>;
 get():Promise<TechnicianEditorRecord>;classify(error:unknown):'conflict'|'rejected'|'denied'|'uncertain';
}){
 if(!isTechnicianForm(port.draft)||port.initial!==null&&(!record(port.initial)||technicianFormIssues(port.initial.attributes,port.zones).length>0)||port.recovery&&!isTechnicianEditorCheckpoint(port.recovery,port.zones))throw Error('invalid_technician_checkpoint');
 if(port.recovery?.baseline&&(!port.initial||port.recovery.baseline.id!==port.initial.id))throw Error('technician_scope_mismatch');
 let baseline=port.recovery?.baseline?copyRecord(port.recovery.baseline):port.recovery?null:port.initial?copyRecord(port.initial):null;
 let draft=copyTechnicianForm(port.recovery?.draft??port.initial?.attributes??port.draft);
 let pending=port.recovery?.pending?copyPending(port.recovery.pending):null;
 let conflict=port.recovery?.conflict??false,latest:TechnicianEditorRecord|null=null,busy=false,closed=false;
 let failure:TechnicianEditorState['failure']=null;
 if(port.recovery&&!pending&&port.initial&&(!baseline||port.initial.revision!==baseline.revision)){conflict=true;latest=!baseline||port.initial.revision>baseline.revision?copyRecord(port.initial):null;}
 let tail:Promise<void>=Promise.resolve();const listeners=new Set<(state:TechnicianEditorState|null)=>void>();
 const active=()=>!closed&&port.active();
 const checkpoint=():TechnicianEditorCheckpoint=>({version:1,baseline:baseline?copyRecord(baseline):null,draft:copyTechnicianForm(draft),pending:pending?copyPending(pending):null,conflict});
 const snapshot=():TechnicianEditorState|null=>active()?{...checkpoint(),busy,latest:latest?copyRecord(latest):null,dirty:!baseline||!same(draft,baseline.attributes),failure,issues:technicianFormIssues(draft,port.zones)}:null;
 const publish=()=>{for(const listener of listeners)listener(snapshot());};
 async function persist(){const cp=checkpoint();const write=tail.then(async()=>{if(active())await port.persist(cp);});tail=write.catch(()=>{});try{await write;return active();}catch{if(active()){failure='storage';publish();}return false;}}
 function accept(value:unknown,expected?:Pending):value is TechnicianEditorRecord {
  if(!record(value)||technicianFormIssues(value.attributes,port.zones).length)return false;
  if(expected?.kind==='save')return value.id===expected.id&&(value.revision===expected.revision||value.revision===expected.revision+1);
  return true;
 }
 return Object.freeze({snapshot,
  subscribe(listener:(state:TechnicianEditorState|null)=>void){listeners.add(listener);listener(snapshot());return ()=>{listeners.delete(listener);};},
  async edit(value:TechnicianForm){if(!active()||!isTechnicianForm(value))return;draft=copyTechnicianForm(value);failure=null;publish();await persist();},
  async save(){
   if(!active()||busy||conflict)return;
   if(!pending){if(technicianFormIssues(draft,port.zones).length){publish();return;}const attrs=copyTechnicianForm(draft);pending=baseline?{kind:'save',id:baseline.id,revision:baseline.revision,attributes:attrs}:{kind:'create',key:port.key(),attributes:attrs};if(!isTechnicianEditorCheckpoint(checkpoint(),port.zones)){pending=null;failure='rejected';publish();return;}}
   busy=true;failure=null;publish();
   try{
    if(!await persist()||!active())return;
    const command=copyPending(pending!);
    try{
     const result=command.kind==='create'?await port.create(copyTechnicianForm(command.attributes),command.key):await port.update(command.id,copyTechnicianForm(command.attributes),command.revision);
     if(!active())return;if(!accept(result,command)){failure='uncertain';publish();return;}
     baseline=copyRecord(result);pending=null;if(same(draft,command.attributes))draft=copyTechnicianForm(result.attributes);failure=null;await persist();
    }catch(error){
     if(!active())return;const kind=port.classify(error);if(kind==='denied'){closed=true;publish();return;}
     failure=kind;if(kind!=='uncertain')pending=null;if(kind==='conflict'){conflict=true;latest=null;}await persist();
    }
   }finally{busy=false;publish();}
  },
  async review(){if(!active()||busy||!conflict)return;busy=true;failure=null;publish();try{if(!active())return;const value=await port.get();if(!active())return;if(!accept(value)||baseline&&(value.id!==baseline.id||value.revision<baseline.revision)){failure='uncertain';return;}latest=copyRecord(value);}catch(error){if(active()){if(port.classify(error)==='denied')closed=true;else failure='uncertain';}}finally{busy=false;publish();}},
  async keepEdits(){if(!active()||busy||!conflict||!latest)return;baseline=copyRecord(latest);latest=null;conflict=false;failure=null;publish();await persist();},
  async useLatest(){if(!active()||busy||!conflict||!latest)return;baseline=copyRecord(latest);draft=copyTechnicianForm(latest.attributes);latest=null;conflict=false;failure=null;publish();await persist();},
  async flush(){for(;;){const current=tail;await current;if(current===tail)return;}},
  dispose(){closed=true;publish();listeners.clear();},
 });
}
