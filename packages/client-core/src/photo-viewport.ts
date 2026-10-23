export interface PhotoTouch {id:number;x:number;y:number}
/** Bounded geometry only; platform views own touch delivery and native rendering. */
export function createPhotoViewport(){
 let viewportWidth=0,viewportHeight=0,imageWidth=0,imageHeight=0;
 let width=0,height=0,scale=1,x=0,y=0;let previous:PhotoTouch[]|null=null;
 const bounded=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
 function clamp(){x=bounded(x,-Math.max(0,(width*scale-viewportWidth)/2),Math.max(0,(width*scale-viewportWidth)/2));y=bounded(y,-Math.max(0,(height*scale-viewportHeight)/2),Math.max(0,(height*scale-viewportHeight)/2));}
 function snapshot(){return {width,height,scale,x,y};}
 function end(){previous=null;}
 return {
  snapshot,end,
  resize(w:number,h:number,iw:number,ih:number){
   if([w,h,iw,ih].some(v=>!Number.isFinite(v)||v<=0||v>1_000_000)){w=0;h=0;iw=0;ih=0;}
   if(w===viewportWidth&&h===viewportHeight&&iw===imageWidth&&ih===imageHeight)return;
   viewportWidth=w;viewportHeight=h;imageWidth=iw;imageHeight=ih;const fit=iw&&ih?Math.min(w/iw,h/ih):0;
   width=iw*fit;height=ih*fit;scale=1;x=0;y=0;end();
  },
  zoom(value:number){if(!Number.isFinite(value))return;const next=bounded(value,1,4);x*=next/scale;y*=next/scale;scale=next;clamp();end();},
  move(input:readonly PhotoTouch[]){
   if(!width||!height||input.length<1||input.length>2||input.some(t=>!Number.isSafeInteger(t.id)||![t.x,t.y].every(Number.isFinite)||Math.abs(t.x)>1_000_000||Math.abs(t.y)>1_000_000)||new Set(input.map(t=>t.id)).size!==input.length){end();return;}
   const touches=input.map(t=>({...t})).sort((a,b)=>a.id-b.id);const before=previous;previous=touches;
   if(!before||before.length!==touches.length||before.some((t,i)=>t.id!==touches[i]!.id))return;
   if(touches.length===1){x+=touches[0]!.x-before[0]!.x;y+=touches[0]!.y-before[0]!.y;}
   else{
    const distance=(points:PhotoTouch[])=>Math.hypot(points[1]!.x-points[0]!.x,points[1]!.y-points[0]!.y);
    const oldDistance=distance(before);const newDistance=distance(touches);if(oldDistance<1||newDistance<1)return;
    const next=bounded(scale*newDistance/oldDistance,1,4),ratio=next/scale;
    const oldX=(before[0]!.x+before[1]!.x)/2-viewportWidth/2,oldY=(before[0]!.y+before[1]!.y)/2-viewportHeight/2;
    x=(touches[0]!.x+touches[1]!.x)/2-viewportWidth/2-(oldX-x)*ratio;
    y=(touches[0]!.y+touches[1]!.y)/2-viewportHeight/2-(oldY-y)*ratio;scale=next;
   }
   clamp();
  },
 };
}
