import {redirect,error} from '@sveltejs/kit';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {publicPianoID,publicPianoPath,relatedPublicPianos,pianoMetadata} from '@pianotechpros/client-core';
import {createTranslator} from '@pianotechpros/i18n';
import {webConfig,publicWebOrigin} from '#lib/server/config.js';
import {publicFailure} from '#lib/showroom/server.js';
import type {PageServerLoad} from './$types';
export const load:PageServerLoad=async({params,locals,setHeaders,request,url})=>{
 setHeaders({'cache-control':'no-store'});
 let id:string;
 try{id=publicPianoID(params.id);}catch{error(404,createTranslator([locals.locale]).t('showroom.notFound'));}
 let result;
 try{result=await createShowroomApiClient(webConfig.apiURL).listing(params.slug,id,request.signal);}catch(cause){publicFailure(cause,locals.locale);}
 const canonicalPath=publicPianoPath(result.profile.slug,result.piano);
 if(url.pathname!==canonicalPath)redirect(307,canonicalPath);
 let related:typeof result.piano[]=[],relatedUnavailable=false;
 try{related=await relatedPublicPianos(result.piano,query=>createShowroomApiClient(webConfig.apiURL).list(params.slug,query,request.signal));}catch{relatedUnavailable=true;}
 return {...result,canonicalPath,related,relatedUnavailable,metadata:pianoMetadata(publicWebOrigin,result.profile,result.piano)};
};
