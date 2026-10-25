import {inventoryForms} from './inventory-form';
type Form=Exclude<typeof inventoryForms[number],''>;
interface RelatedPiano {id:string;dealer_id:string;form:string;status:string}
/** Public projection orchestration; never reads authenticated inventory. */
export async function relatedPublicPianos<P extends RelatedPiano>(current:P,load:(query:{form?:Form;availability:'available';limit:4})=>Promise<{profile:{id:string};pianos:P[]}>):Promise<P[]>{
 async function read(form?:Form){
  const page=await load({...form?{form}:{},availability:'available',limit:4});
  if(page.profile.id!==current.dealer_id||page.pianos.length>4)throw new Error('invalid_related_projection');
  const ids=new Set<string>();
  for(const piano of page.pianos){
   if(piano.dealer_id!==current.dealer_id||ids.has(piano.id))throw new Error('invalid_related_projection');
   ids.add(piano.id);
  }
  return page.pianos.filter(p=>p.id!==current.id&&p.status==='available'&&(!form||p.form===form)).slice(0,3);
 }
 const form=inventoryForms.find(value=>value===current.form);
 if(!form)throw new Error('invalid_related_projection');
 const matched=await read(form);return matched.length?matched:read();
}
