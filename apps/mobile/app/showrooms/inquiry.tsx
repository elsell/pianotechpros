import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Keyboard,KeyboardAvoidingView,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams} from 'expo-router';
import {createPublicInquiryApiClient,InquiryClientError} from '@pianotechpros/api-client';
import {createInquiryComposer,createInquiryProof,publicPianoID,type InquiryContactField} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {NativeButton} from '../../src/native-button';
import {NativeChoiceIndicator} from '../../src/native-choice-indicator';
import {useMobileSession} from '../../src/session-provider';
import {useNativeTheme} from '../../src/native-theme';
import {InquiryVerification} from '../../src/showroom/InquiryVerification';
function BuyerForm({slug,id}:{slug:string;id:string}){
 const {apiURL,webURL,inquiry,i18n}=useMobileSession();const theme=useNativeTheme();const [,render]=useState(0);const [verification,setVerification]=useState(0);
 const inputs=useRef<Partial<Record<InquiryContactField,TextInput|null>>>({});const scroll=useRef<ScrollView>(null);const mounted=useRef(true);
 const proofURL=webURL+'/inquiry-verification?siteKey='+encodeURIComponent(inquiry.policy==='enabled'?inquiry.siteKey:'');
 const proof=useMemo(()=>createInquiryProof(proofURL),[proofURL]);
 const composer=useMemo(()=>{const api=createPublicInquiryApiClient(apiURL);return createInquiryComposer({
  submit:(body,signal)=>api.submit(slug,id,{...body,preference:body.preference as 'email'|'phone'|'either'},signal),
  classify:error=>error instanceof InquiryClientError&&error.code!=='unauthenticated'&&error.code!=='conflict'?error.code:'unavailable',changed:()=>render(old=>old+1),
 });},[apiURL,slug,id]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;composer.dispose();proof.clear();};},[composer,proof]);
 const state=composer.state();const text={color:theme.text,fontSize:17};const t=(key:string)=>i18n.t(`inquiry.${key}` as MessageKey);
 async function send(){
  if(state.busy||inquiry.policy==='unavailable'||inquiry.policy==='enabled'&&!proof.ready())return;
  Keyboard.dismiss();const token=proof.take();setVerification(old=>old+1);
  await composer.submit(token,'');if(!mounted.current)return;
  const result=composer.state();const first=result.errors[0];if(first)inputs.current[first]?.focus();else scroll.current?.scrollTo({y:0,animated:true});
  AccessibilityInfo.announceForAccessibility(result.delivered?t('sent'):first?t('validation'):result.issue?t('error.'+result.issue):t('unavailable'));
 }
 return <KeyboardAvoidingView style={{flex:1}} enabled={Platform.OS==='android'} behavior="height"><ScrollView ref={scroll} contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
 {inquiry.policy==='unavailable'?<Text style={text}>{t('unavailable')}</Text>:state.delivered?<Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{...text,fontSize:24}}>{t('sent')}</Text>:<>
 <Text style={text}>{t('intro')}</Text>
 {state.errors.length?<Text accessibilityRole="alert" style={text}>{t('validation')}</Text>:null}
 {state.issue?<Text accessibilityRole="alert" style={text}>{t('error.'+state.issue)}</Text>:null}
 {(['name','email','phone','message'] as const).map((field,index)=><View key={field} style={{gap:8}}><Text style={text}>{t(field)}</Text><TextInput ref={value=>{inputs.current[field]=value;}} accessibilityLabel={t(field)} accessibilityHint={state.errors.includes(field)?t('invalid.'+field):undefined}
 value={state.fields[field]} editable={!state.busy} onChangeText={value=>composer.set(field,value)} multiline={field==='message'}
 keyboardType={field==='email'?'email-address':field==='phone'?'phone-pad':'default'} autoCapitalize={field==='email'?'none':field==='message'?'sentences':'words'} autoCorrect={field!=='email'&&field!=='phone'}
 autoComplete={field==='name'?'name':field==='email'?'email':field==='phone'?'tel':'off'} returnKeyType={field==='message'?'default':'next'} submitBehavior={field==='message'?'newline':'submit'}
 onSubmitEditing={()=>{if(field!=='message')inputs.current[(['name','email','phone','message'] as const)[index+1]]?.focus();}}
 style={{...text,minHeight:field==='message'?160:52,textAlignVertical:field==='message'?'top':'center',padding:12,borderRadius:10,borderWidth:1,borderColor:theme.border}}/>
 {state.errors.includes(field)?<Text accessibilityRole="alert" style={text}>{t('invalid.'+field)}</Text>:null}</View>)}
 <Text style={text}>{t('preference')}</Text><View accessibilityRole="radiogroup" accessibilityLabel={t('preference')}>
 {(['email','phone','either'] as const).map(value=><Pressable key={value} disabled={state.busy} accessibilityRole="radio" accessibilityLabel={t('preference.'+value)} accessibilityState={{checked:state.fields.preference===value,disabled:state.busy}} onPress={()=>{Keyboard.dismiss();composer.set('preference',value);}} style={{minHeight:52,flexDirection:'row',alignItems:'center'}}><NativeChoiceIndicator checked={state.fields.preference===value}/><Text style={{...text,flex:1}}>{t('preference.'+value)}</Text></Pressable>)}
 </View>
 {inquiry.policy==='enabled'&&!state.busy?<InquiryVerification key={verification} url={proofURL} proof={proof} changed={()=>render(old=>old+1)}/>:null}
 <NativeButton title={t(state.busy?'sending':'send')} disabled={state.busy||inquiry.policy==='enabled'&&!proof.ready()} onPress={()=>void send()}/>
 </>}
 </ScrollView></KeyboardAvoidingView>;
}
export default function PublicInquiry(){
 const params=useLocalSearchParams<{slug:string;id:string}>();const [focused,setFocused]=useState(false);const {i18n}=useMobileSession();const theme=useNativeTheme();
 useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false);},[]));
 let id='';try{id=publicPianoID(typeof params.id==='string'?params.id:'');}catch{/* Invalid public links never dispatch buyer data. */}
 const slug=typeof params.slug==='string'?params.slug:'';
 return focused&&id&&slug?<BuyerForm key={slug+':'+id} slug={slug} id={id}/>:<Text style={{color:theme.text,fontSize:17}}>{i18n.t('inquiry.unavailable')}</Text>;
}
