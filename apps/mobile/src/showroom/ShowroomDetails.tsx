import {useEffect,useRef,useState} from 'react';
import {Linking,Text,View} from 'react-native';
import type {PublicShowroomProfile} from '@pianotechpros/api-client';
import type {MessageKey} from '@pianotechpros/i18n';
import {NativeButton} from '../native-button';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
/** The public visit/contact surface is available independently of inventory. */
export function ShowroomDetails({profile,subject}:{profile:PublicShowroomProfile;subject?:string}){
 const {i18n}=useMobileSession();const theme=useNativeTheme();const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const lifetime=useRef({active:true,busy:false});useEffect(()=>{const scope={active:true,busy:false};lifetime.current=scope;return()=>{scope.active=false;};},[profile.slug]);
 const text={color:theme.text,fontSize:17},heading={...text,fontSize:24,fontWeight:'600' as const};const t=(key:string)=>i18n.t(`showroom.${key}` as MessageKey);
 const phone=profile.phone.replace(/[^+0-9]/g,'');const address=[profile.street_address_1,profile.street_address_2,profile.city,profile.region,profile.postal_code].filter(Boolean).join('\n');
 async function open(url:string){const scope=lifetime.current;if(!scope.active||scope.busy)return;scope.busy=true;setBusy(true);setFailed(false);try{await Linking.openURL(url);}catch{if(scope.active)setFailed(true);}finally{scope.busy=false;if(scope.active)setBusy(false);}}
 return <View style={{gap:20}}><Text accessibilityRole="header" style={heading}>{profile.name}</Text>{profile.description?<Text selectable style={text}>{profile.description}</Text>:null}
 {failed?<Text accessibilityRole="alert" style={text}>{t('contactFailed')}</Text>:null}
 {/^[+]?[0-9]+$/.test(phone)?<NativeButton title={t('call')} disabled={busy} onPress={()=>void open('tel:'+phone)}/>:null}
 <NativeButton title={t('email')} disabled={busy} onPress={()=>void open('mailto:'+encodeURIComponent(profile.email)+(subject?'?subject='+encodeURIComponent(subject):''))}/>
 {profile.website_url?<NativeButton title={t('website')} disabled={busy} onPress={()=>void open(profile.website_url)}/>:null}
 {address||profile.appointment_note?<View style={{gap:12}}><Text accessibilityRole="header" style={heading}>{t('visit')}</Text>{address?<Text selectable style={text}>{address}</Text>:null}{profile.appointment_note?<Text selectable style={text}>{profile.appointment_note}</Text>:null}</View>:null}
 {(['delivery','warranty','service'] as const).map(key=>{const note=profile[`${key}_note`];return note?<View key={key} style={{gap:8}}><Text accessibilityRole="header" style={heading}>{t(key)}</Text><Text selectable style={text}>{note}</Text></View>:null;})}
 </View>;
}
