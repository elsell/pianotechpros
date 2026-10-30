import {PublicPrice} from '../../src/showroom/PublicPrice';
import {useEffect,useMemo,useRef,useState} from 'react';
import {RefreshControl,ScrollView,Text,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {createShowroomApiClient,type PublicPiano,type PublicShowroomProfile} from '@pianotechpros/api-client';
import {createPublicListingResource,publicPianoID,publicPianoPath,relatedPublicPianos,sharePublicLink} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {NativeButton} from '../../src/native-button';
import {useMobileSession} from '../../src/session-provider';
import {useNativeTheme} from '../../src/native-theme';
import {nativePublicSharing} from '../../src/public-share';
import {usePublicState} from '../../src/showroom/public-read';
import {PublicImage} from '../../src/showroom/PublicImage';
import {ShowroomDetails} from '../../src/showroom/ShowroomDetails';
import {PianoCard} from '../../src/showroom/PianoCard';
function ListingContent({profile,piano,related,relatedFailed,relatedLoading}:{profile:PublicShowroomProfile;piano:PublicPiano;related:PublicPiano[];relatedFailed:boolean;relatedLoading:boolean}){
 const {i18n,webURL}=useMobileSession();const theme=useNativeTheme();const router=useRouter();const [selected,setSelected]=useState(0),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const lifetime=useRef({active:true,busy:false});useEffect(()=>{const scope={active:true,busy:false};lifetime.current=scope;return()=>{scope.active=false;};},[]);
 const text={color:theme.text,fontSize:17},heading={...text,fontSize:24,fontWeight:'600' as const};const t=(key:string)=>i18n.t(`showroom.${key}` as MessageKey);
 const photo=piano.photos[selected]??piano.photos[0];
 async function action(work:()=>Promise<unknown>){const scope=lifetime.current;if(!scope.active||scope.busy)return;scope.busy=true;setBusy(true);setFailed(false);try{await work();}catch{if(scope.active)setFailed(true);}finally{scope.busy=false;if(scope.active)setBusy(false);}}
 const facts:{label:MessageKey;value:string}[]=[{label:'showroom.stock',value:piano.stock_number},{label:'showroom.make',value:piano.make},{label:'showroom.model',value:piano.model},{label:'showroom.finish',value:piano.finish},{label:'showroom.size',value:piano.size},{label:'inventory.field.condition',value:i18n.t(`inventory.condition.${piano.condition}` as MessageKey)},{label:'inventory.field.player_system',value:i18n.t(piano.player_system?'inventory.edit.yes':'inventory.edit.no')}];
 if(piano.manufactured)facts.push({label:'inventory.edit.date',value:i18n.t('voice.dateValue',{year:piano.manufactured.year,month:piano.manufactured.month||i18n.t('inventory.edit.unknown'),day:piano.manufactured.day||i18n.t('inventory.edit.unknown')})});
 return <View style={{gap:20}}>
 {photo?<PublicImage slug={profile.slug} pianoID={piano.id} photoID={photo.id} previewLabel={i18n.t('inventory.photos.preview',{number:i18n.number(selected+1)})} alt={photo.alt_text||i18n.t('showroom.photo',{title:piano.title,number:selected+1})}/>:null}
 {piano.photos.length>1?<View style={{gap:8}}><Text accessibilityLiveRegion="polite" style={text}>{i18n.t('showroom.photoPosition',{number:selected+1,total:piano.photos.length})}</Text><View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}><NativeButton title={t('previousPhoto')} onPress={()=>setSelected(value=>(value-1+piano.photos.length)%piano.photos.length)}/><NativeButton title={t('nextPhoto')} onPress={()=>setSelected(value=>(value+1)%piano.photos.length)}/></View></View>:null}
 <Text accessibilityRole="header" style={{...heading,fontSize:30}}>{piano.title}</Text><Text style={text}>{i18n.t(`inventory.status.${piano.status}` as MessageKey)}</Text><PublicPrice price={piano.price} style={{...text,fontSize:22}}/><Text style={text}>{i18n.t(`inventory.form.${piano.form}` as MessageKey)}</Text>
 <NativeButton title={t('sharing.share')} disabled={busy} onPress={()=>void action(()=>sharePublicLink({url:new URL(publicPianoPath(profile.slug,piano),webURL).href,title:piano.title},nativePublicSharing))}/>
 {failed?<Text accessibilityRole="alert" style={text}>{t('contactFailed')}</Text>:null}
 <Text accessibilityRole="header" style={heading}>{t('details')}</Text>{piano.description?<Text selectable style={text}>{piano.description}</Text>:null}
 {facts.filter(fact=>fact.value).map(fact=><View key={fact.label} style={{gap:6,paddingVertical:8,borderBottomWidth:1,borderColor:theme.border}}><Text style={{color:theme.secondary,fontSize:16}}>{i18n.t(fact.label)}</Text><Text selectable style={text}>{fact.value}</Text></View>)}
 <NativeButton title={i18n.t('inquiry.heading')} onPress={()=>router.push({pathname:'/showrooms/inquiry',params:{slug:profile.slug,id:piano.id}})}/>
 <ShowroomDetails profile={profile} subject={piano.title}/>
 <Text accessibilityRole="header" style={heading}>{t('related')}</Text>{relatedLoading?<Text accessibilityLiveRegion="polite" style={text}>{i18n.t('common.loading')}</Text>:null}{relatedFailed?<Text style={text}>{t('relatedUnavailable')}</Text>:null}
 {related.map(other=><PianoCard key={other.id} slug={profile.slug} piano={other} open={()=>router.push({pathname:'/showrooms/listing',params:{slug:profile.slug,id:other.id}})}/>)}
 <NativeButton title={t('back')} onPress={()=>router.navigate({pathname:'/showrooms/catalog',params:{slug:profile.slug}})}/>
 </View>;
}
export default function PublicListing(){
 const params=useLocalSearchParams<{slug:string;id:string}>();const slug=typeof params.slug==='string'?params.slug:'',segment=typeof params.id==='string'?params.id:'';
 const {apiURL,i18n}=useMobileSession();const theme=useNativeTheme();
 const model=useMemo(()=>{
  const api=createShowroomApiClient(apiURL);
  return createPublicListingResource(signal=>api.listing(slug,publicPianoID(segment),signal),
   (listing,signal)=>relatedPublicPianos(listing.piano,query=>api.list(slug,query,signal)));
 },[apiURL,slug,segment]);const state=usePublicState(model);
 return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{padding:20,gap:16}} refreshControl={<RefreshControl refreshing={state.loading} onRefresh={()=>void model.refresh()} tintColor={theme.accent}/>}>
 {state.value?<ListingContent key={slug+':'+segment} {...state.value} related={state.related} relatedFailed={state.relatedFailure} relatedLoading={state.relatedLoading}/>:state.failure?<><Text accessibilityRole="alert" style={{color:theme.text,fontSize:17}}>{i18n.t('showroom.unavailable')}</Text><NativeButton title={i18n.t('dealer.retry')} onPress={()=>void model.refresh()}/></>:null}
 </ScrollView>;
}
