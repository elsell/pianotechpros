export interface PublicLink {url:string;title:string}
export interface PublicSharingPort {share?(value:PublicLink):Promise<void>;copy(value:string):Promise<void>}
export async function sharePublicLink(link:PublicLink,port:PublicSharingPort):Promise<'shared'|'copied'|'cancelled'>{
 const url=new URL(link.url);
 if(url.username||url.password||url.search||url.hash||!/^\/showrooms\/[A-Za-z0-9_-]{1,128}\/pianos\/[A-Za-z0-9_-]{1,160}$/.test(url.pathname)||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('invalid_public_link');
 const payload={url:url.href,title:link.title};
 if(port.share){try{await port.share(payload);return 'shared';}catch(error){if(error instanceof Error&&error.name==='AbortError')return 'cancelled';throw error;}}
 await port.copy(payload.url);return 'copied';
}
