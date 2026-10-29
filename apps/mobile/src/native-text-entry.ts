/** Native typing owns the text; React snapshots must not echo stale characters. */
export function createNativeTextEntry(port:{read():string;write(value:string):void;change(value:string):void}){
 let editing=false,last=port.read();
 function synchronize(){if(editing)return;const current=port.read();if(current!==last){last=current;port.write(current);}}
 return {initial:last,begin(){editing=true;},change(value:string){last=value;port.change(value);},end(){editing=false;synchronize();},synchronize};
}
