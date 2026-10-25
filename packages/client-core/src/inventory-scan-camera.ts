export type InventoryScanCameraState={visible:boolean;busy:boolean;ticket:number;failure:null|'denied'|'failed'};
/** A camera acquisition owns permission completion and exactly one result. */
export function createInventoryScanCamera(port:{active():boolean;acquire():Promise<boolean>}){
 let disposed=false;let state:InventoryScanCameraState={visible:false,busy:false,ticket:0,failure:null};const listeners=new Set<(value:InventoryScanCameraState)=>void>();
 const snapshot=()=>({...state});function notify(){for(const listener of listeners)listener(snapshot());}
 function cancel(){state={visible:false,busy:false,ticket:state.ticket+1,failure:null};notify();}
 return {snapshot,cancel,subscribe(listener:(value:InventoryScanCameraState)=>void){listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  async start(){if(disposed||state.busy||!port.active())return;cancel();const ticket=state.ticket;state.busy=true;notify();if(disposed||state.ticket!==ticket)return;if(!port.active()){cancel();return;}try{const granted=await port.acquire();if(disposed||state.ticket!==ticket)return;state={...state,busy:false,visible:granted&&port.active(),failure:port.active()&&!granted?'denied':null};notify();}catch{if(disposed||state.ticket!==ticket)return;state={...state,busy:false,visible:false,failure:port.active()?'failed':null};notify();}},
  consume(ticket:number){if(disposed||!port.active()||!state.visible||ticket!==state.ticket)return false;cancel();return true;},
  fail(ticket:number){if(disposed||ticket!==state.ticket||!state.visible)return;cancel();state.failure='failed';notify();},
  dispose(){disposed=true;cancel();listeners.clear();},
 };
}
