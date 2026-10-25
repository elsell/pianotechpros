import {publicPianoPath} from './showroom-url';
import type {PublicLink} from './public-link-share';
interface Profile {id:string;slug:string}
interface Listing {profile:Profile;piano:{id:string;dealer_id:string;title:string}}
export async function resolvePublicListingLink(target:{origin:string;dealerID:string;recordID:string},port:{profile(signal:AbortSignal):Promise<Profile>;listing(slug:string,id:string,signal:AbortSignal):Promise<Listing>},signal:AbortSignal):Promise<PublicLink>{
 const active=()=>{if(signal.aborted)throw new Error('public_link_cancelled');};
 active();if(new URL(target.origin).origin!==target.origin)throw new Error('invalid_public_origin');
 const profile=await port.profile(signal);active();
 if(profile.id!==target.dealerID)throw new Error('invalid_public_scope');
 const listing=await port.listing(profile.slug,target.recordID,signal);active();
 if(listing.profile.id!==target.dealerID||listing.profile.slug!==profile.slug||listing.piano.dealer_id!==target.dealerID||listing.piano.id!==target.recordID)throw new Error('invalid_public_scope');
 return {url:target.origin+publicPianoPath(profile.slug,listing.piano),title:listing.piano.title};
}
