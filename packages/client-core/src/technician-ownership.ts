export interface TechnicianWorkspaceLease {release():Promise<void>}
export interface TechnicianWorkspaceOwnership {acquire(key:string):Promise<TechnicianWorkspaceLease|null>}
/** Single-runtime arbitration. Platforms must share one instance, not one per screen. */
export function createTechnicianOwnershipRegistry():TechnicianWorkspaceOwnership {
 const owners=new Map<string,symbol>();
 return Object.freeze({async acquire(key:string){
  if(typeof key!=='string'||!key||key.length>2048)throw Error('technician_ownership_unavailable');
  if(owners.has(key))return null;const token=Symbol();owners.set(key,token);
  return Object.freeze({async release(){if(owners.get(key)===token)owners.delete(key);}});
 }});
}
