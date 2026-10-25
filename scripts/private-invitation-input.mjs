// Playwright fill failures can include the complete value in their action log.
export async function fillPrivateInvitation(locator,code,options){
 try{return await locator.fill(code,options);}catch{throw new Error('invitation_entry_failed');}
}
