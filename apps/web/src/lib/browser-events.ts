/** Browser capabilities are isolated here; messages are untrusted refetch hints. */
export function browserEvents(channelName: string) {
 return {
  addFocus(listener:()=>void){window.addEventListener('focus',listener);},
  removeFocus(listener:()=>void){window.removeEventListener('focus',listener);},
  addVisibility(listener:()=>void){document.addEventListener('visibilitychange',listener);},
  removeVisibility(listener:()=>void){document.removeEventListener('visibilitychange',listener);},
  visible:()=>document.visibilityState==='visible',
  openChannel(receive:(value:unknown)=>void){
   const channel=new BroadcastChannel(channelName);
   const listener=(event:MessageEvent<unknown>)=>receive(event.data);
   try{channel.addEventListener('message',listener);}catch(error){channel.close();throw error;}
   return {publish(value:unknown){channel.postMessage(value);},close(){channel.removeEventListener('message',listener);channel.close();}};
  },
 };
}

/** A tab close cannot wait for async storage; warn only while protection is incomplete. */
export function protectPendingNavigation(pending:()=>boolean){
 const beforeUnload=(event:BeforeUnloadEvent)=>{if(pending()){event.preventDefault();event.returnValue='';}};
 window.addEventListener('beforeunload',beforeUnload);
 return()=>window.removeEventListener('beforeunload',beforeUnload);
}

/** Held until durable New-capture handoff; ifAvailable never waits behind another tab. */
export function claimBrowserInventoryCapture(userID:string,dealerID:string):Promise<()=>void>{
 return claimBrowserLease(`pianotechpros.capture:${JSON.stringify([userID,dealerID])}`);
}

/** Photo ledgers remain exclusively owned until their queued mutations drain. */
export function claimBrowserInventoryPhotos(userID:string,dealerID:string,recordID:string):Promise<()=>void>{
 return claimBrowserLease(`pianotechpros.photos:${JSON.stringify([userID,dealerID,recordID])}`);
}
function claimBrowserLease(name:string):Promise<()=>void>{
 return new Promise((resolve,reject)=>{
  if(!navigator.locks){reject(new Error('inventory_capture_unavailable'));return;}
  void navigator.locks.request(name,{ifAvailable:true},async lock=>{
   if(!lock){reject(new Error('inventory_capture_busy'));return;}
   await new Promise<void>(release=>resolve(release));
  }).catch(()=>reject(new Error('inventory_capture_unavailable')));
 });
}

/** Body-level labels isolate print layout from the editor and retain native dialog focus. */
export function mountInventoryLabel(node:HTMLDialogElement){
 document.body.appendChild(node);
 return {destroy(){node.remove();}};
}
export function printInventoryLabel(){window.print();}
