/** Only SDK audio files from the app-private cache are eligible for read/deletion. */
export function ownedVoiceCachePath(cache:string,uri:string):boolean{
 if(!cache.startsWith('file:///')||!uri.startsWith('file:///'))return false;
 const root=cache.endsWith('/')?cache:`${cache}/`;if(!uri.startsWith(root))return false;
 return /^(?:Audio|ExpoAudio)\/recording-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.m4a$/.test(uri.slice(root.length));
}
