const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const exactUUID=new RegExp('^'+uuid+'$','i');
const alias=new RegExp('^[a-z0-9](?:[a-z0-9-]{0,94}[a-z0-9])?-('+uuid+')$','i');
const embeddedUUID=new RegExp(uuid,'i');
const safeID=/^[A-Za-z0-9_-]{1,128}$/;
export function publicPianoID(segment:string):string{
 if(exactUUID.test(segment))return segment.toLowerCase();
 const match=alias.exec(segment);if(match)return match[1].toLowerCase();
 if(!safeID.test(segment)||embeddedUUID.test(segment))throw new Error('invalid_public_piano_segment');
 return segment;
}
/** Only a previously validated public projection belongs at this boundary. */
export function publicPianoPath(slug:string,piano:{id:string;title:string}):string{
 if(!safeID.test(slug)||!safeID.test(piano.id))throw new Error('invalid_public_piano_identity');
 let segment=piano.id;
 if(exactUUID.test(piano.id)){
  const title=piano.title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,96).replace(/-+$/,'');
  segment=(title?title+'-':'')+piano.id.toLowerCase();
 }
 return '/showrooms/'+encodeURIComponent(slug)+'/pianos/'+encodeURIComponent(segment);
}
