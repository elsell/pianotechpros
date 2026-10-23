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
