/** Accept only exact SDK-generated files returned by the current picker/render call. */
export function ownedPhotoCachePath(cache:string,uri:string,kind:'picker'|'rendered'):boolean {
 if(!cache.startsWith('file:///')||!uri.startsWith('file:///'))return false;
 const root=cache.endsWith('/')?cache:`${cache}/`;
 if(!uri.startsWith(root))return false;
 const name=uri.slice(root.length);
 // SDK 55 iOS picker may place its generated UUID file directly in cache.
 return kind==='picker'
  ? /^(?:ImagePicker\/)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.[A-Za-z0-9]{1,10}$/.test(name)
  : /^ImageManipulator\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.jpe?g$/.test(name);
}
