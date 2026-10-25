import {createShowroomApiClient,ShowroomClientError} from '@pianotechpros/api-client';
import {serverApiURL} from '#lib/server/config.js';
import type {RequestHandler} from './$types';
export const GET:RequestHandler=async({params,request})=>{
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 try{const bytes=await createShowroomApiClient(serverApiURL).photo(params.slug,params.id,params.photoID,request.signal);return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg'}});}
 catch(cause){return new Response(null,{status:cause instanceof ShowroomClientError&&cause.code==='not_found'?404:503,headers});}
};
