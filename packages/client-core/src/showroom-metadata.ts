import {publicPianoPath} from './showroom-url';
import {inventoryCurrencies} from './inventory-form';
interface Profile {id:string;slug:string;name:string;description:string;tagline:string;email:string;phone:string;street_address_1:string;street_address_2:string;city:string;region:string;postal_code:string;banner:{id:string;width:number;height:number}|null}
interface Piano {id:string;dealer_id:string;title:string;description:string;stock_number:string;make:string;model:string;status:string;condition:string;price:{minor_units:number;currency:string}|null;photos:{id:string;alt_text:string}[]}
export interface ShowroomMetadata {canonical:string;title:string;description:string;image:string|null;jsonLD:string}
function serialize(value:unknown){return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
function description(value:string){return [...value.replace(/\s+/g,' ').trim()].slice(0,160).join('');}
function base(profile:Profile){return '/showrooms/'+encodeURIComponent(profile.slug);}
/** Inputs are validated public API projections; origin comes only from bootstrap. */
export function showroomMetadata<P extends Profile>(origin:string|null,profile:P):ShowroomMetadata|null{
 if(origin===null)return null;
 const canonical=origin+base(profile),image=profile.banner?canonical+'/banner/'+encodeURIComponent(profile.banner.id):null;
 const data={'@context':'https://schema.org','@type':'Store',name:profile.name,url:canonical,description:profile.description||profile.tagline,email:profile.email,
  ...(profile.phone?{telephone:profile.phone}:{}),...(image?{image}:{}),
  address:{'@type':'PostalAddress',streetAddress:[profile.street_address_1,profile.street_address_2].filter(Boolean).join(', '),addressLocality:profile.city,addressRegion:profile.region,postalCode:profile.postal_code}};
 return {canonical,title:profile.name,description:description(profile.tagline||profile.description),image,jsonLD:serialize(data)};
}
export function pianoMetadata<P extends Profile,L extends Piano>(origin:string|null,profile:P,piano:L):ShowroomMetadata|null{
 if(origin===null)return null;
 if(piano.dealer_id!==profile.id||!['available','reserved','sold'].includes(piano.status))throw new Error('invalid_public_metadata');
 const canonical=origin+publicPianoPath(profile.slug,piano);
 const images=piano.photos.map(photo=>origin+base(profile)+'/pianos/'+encodeURIComponent(piano.id)+'/photos/'+encodeURIComponent(photo.id));
 let offer:Record<string,unknown>|null=null;
 if(piano.price){
  const {minor_units:units,currency}=piano.price;
  if(!Number.isSafeInteger(units)||units<0||!(inventoryCurrencies as readonly string[]).includes(currency))throw new Error('invalid_public_metadata');
  const minor=BigInt(units),price=currency==='JPY'?minor.toString():`${minor/100n}.${(minor%100n).toString().padStart(2,'0')}`;
  offer={'@type':'Offer',url:canonical,price,priceCurrency:currency,availability:'https://schema.org/'+(piano.status==='available'?'InStock':piano.status==='reserved'?'LimitedAvailability':'SoldOut'),seller:{'@type':'Store',name:profile.name,url:origin+base(profile)}};
 }
 const data={'@context':'https://schema.org','@type':'Product',name:piano.title,url:canonical,description:piano.description,sku:piano.stock_number,image:images,
  ...(piano.make?{brand:{'@type':'Brand',name:piano.make}}:{}),...(piano.model?{model:piano.model}:{}),
  ...(piano.condition==='new'?{itemCondition:'https://schema.org/NewCondition'}:['used','restored','rebuilt','consignment'].includes(piano.condition)?{itemCondition:'https://schema.org/UsedCondition'}:{}),...(offer?{offers:offer}:{})};
 return {canonical,title:piano.title+' · '+profile.name,description:description(piano.description||piano.title),image:images[0]??null,jsonLD:serialize(data)};
}
