export interface CustomerWorkspaceLease {release():Promise<void>}
export interface CustomerWorkspaceOwnership {acquire(key:string):Promise<CustomerWorkspaceLease|null>}
/** Single-runtime arbitration. Platforms must share one instance, not one per screen. */
export function createCustomerOwnershipRegistry():CustomerWorkspaceOwnership {
 const owners=new Map<string,symbol>();
 return Object.freeze({async acquire(key:string){
  if(typeof key!=='string'||!key||key.length>2048)throw Error('customer_ownership_unavailable');
  if(owners.has(key))return null;const token=Symbol();owners.set(key,token);
  return Object.freeze({async release(){if(owners.get(key)===token)owners.delete(key);}});
 }});
}
