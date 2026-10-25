import {useEffect,useRef,useState} from 'react';
import {Alert,Button,FlatList,InputAccessoryView,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation,usePreventRemove,type NavigationAction} from '@react-navigation/native';
import {randomUUID} from 'expo-crypto';
import {addCustomerLocation,addCustomerPiano,removeCustomerLocation,removeCustomerPiano,customerComparison,customerPianoForms,type CustomerForm} from '@pianotechpros/client-core';
import {customerContactFields,customerLocationFields,customerPianoFields,customerFieldLabel,type MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../src/session-provider';
import {useNativeTheme} from '../src/native-theme';
import {useCustomerWorkspace} from '../src/customer/use-workspace';

type Section={kind:'locations'|'pianos';key:string}|null;
type Choice={path:string;value:string;options:{value:string;label:string}[]};
export default function Customer(){
 const auth=useMobileSession(),theme=useNativeTheme();
 if(!auth.ready||!auth.profile||!auth.session)return <View style={{padding:20}}><Text style={{color:theme.text}}>{auth.i18n.t(auth.ready?'customer.access':'common.loading')}</Text></View>;
 return <Editor key={auth.apiURL+'|'+auth.profile.id} accountId={auth.profile.id} apiURL={auth.apiURL}/>;
}
function Editor({accountId,apiURL}:{accountId:string;apiURL:string}){
 const {i18n}=useMobileSession(),theme=useNativeTheme(),navigation=useNavigation();
 const {workspace,state,failure,loading,retry}=useCustomerWorkspace(accountId,apiURL);
 const [section,setSection]=useState<Section>(null),[choice,setChoice]=useState<Choice|null>(null),[search,setSearch]=useState('');
 const [writes,setWrites]=useState(0),[edited,setEdited]=useState(false),[showIssues,setShowIssues]=useState(false),[storageFailure,setStorageFailure]=useState(false);
 const [leaving,setLeaving]=useState<NavigationAction|null>(null);const navigating=useRef(false);
 const inputs=useRef<Record<string,TextInput>>({}),[focus,setFocus]=useState<string|null>(null);
 const scroll=useRef<ScrollView>(null);
 useEffect(()=>{scroll.current?.scrollTo({y:0,animated:false});},[section?.kind,section?.key]);
 useEffect(()=>{if(!state){setChoice(null);setSearch('');setSection(null);}},[state]);
 useEffect(()=>{if(focus){inputs.current[focus]?.focus();setFocus(null);}},[focus,section]);
 useEffect(()=>{if(leaving)navigation.dispatch(leaving);},[leaving,navigation]);
 usePreventRemove(!leaving,({data})=>{void back(data.action);});
 async function back(action:NavigationAction){
  if(navigating.current)return;navigating.current=true;
  try{
   if(workspace&&!workspace.editor.snapshot()){await workspace.cleanup();setLeaving(action);return;}
   if(workspace&&!await workspace.protect()){setStorageFailure(true);return;}
   if(section){setSection(null);setShowIssues(false);Keyboard.dismiss();return;}
   if(workspace&&!await workspace.close()){setStorageFailure(true);return;}
   setLeaving(action);
  }catch{setStorageFailure(true);}finally{navigating.current=false;}
 }
 async function edit(next:CustomerForm){if(!workspace||leaving)return;setEdited(true);setWrites(n=>n+1);try{await workspace.editor.edit(next);setStorageFailure(false);}finally{setWrites(n=>n-1);}}
 function change(field:string,value:string|boolean){if(!state)return;const next=state.draft;if(section){const row=next[section.kind].find(row=>row.key===section.key);if(row)Object.assign(row,{[field]:value});}else Object.assign(next,{[field]:value});void edit(next);}
 async function select(next:Section){if(workspace&&!await workspace.protect()){setStorageFailure(true);return;}Keyboard.dismiss();setSection(next);setShowIssues(false);}
 async function add(kind:'locations'|'pianos'){if(!state)return;const next=kind==='locations'?addCustomerLocation(state.draft,randomUUID):addCustomerPiano(state.draft,state.draft.locations[0]?.key??'',randomUUID);if(next){await edit(next);await select({kind,key:next[kind].at(-1)!.key});}}
 function focusIssue(path:string){const parts=path.split('.');setSection(parts.length===3?{kind:parts[0] as 'locations'|'pianos',key:parts[1]}:null);setShowIssues(true);setFocus(path);}
 async function save(){if(!workspace||!state)return;setShowIssues(true);if(!state.pending&&state.issues.length){focusIssue(state.issues[0].path);return;}await workspace.editor.save();}
 function remove(){if(!section)return;const target={...section};Alert.alert(i18n.t('customer.removeTitle'),i18n.t('customer.removeHelp'),[{text:i18n.t('customer.cancel'),style:'cancel'},{text:i18n.t('customer.remove'),style:'destructive',onPress:()=>{const current=workspace?.editor.snapshot();if(!current)return;const next=target.kind==='locations'?removeCustomerLocation(current.draft,target.key,true):removeCustomerPiano(current.draft,target.key,true);if(next)void edit(next).then(()=>select(null));}}]);}
 const location=section?.kind==='locations'?state?.draft.locations.find(row=>row.key===section.key):undefined;
 const piano=section?.kind==='pianos'?state?.draft.pianos.find(row=>row.key===section.key):undefined;
 const invalid=(path:string)=>showIssues&&!!state?.issues.some(issue=>issue.path===path);
 const text={color:theme.text,fontSize:17},heading={...text,fontSize:23,fontWeight:'600' as const};
 function field(path:string,value:string,required:boolean,max:number){return <View key={path} style={{gap:6}}><Text style={text}>{i18n.t(customerFieldLabel(path))} · {i18n.t(required?'customer.required':'customer.optional')}</Text><TextInput ref={input=>{if(input)inputs.current[path]=input;else delete inputs.current[path];}} accessibilityLabel={i18n.t(customerFieldLabel(path))} accessibilityHint={invalid(path)?i18n.t('customer.fieldError'):undefined} value={value} onChangeText={value=>change(path.split('.').at(-1)!,value)} maxLength={max*2} multiline={path.endsWith('notes')} keyboardType={path.endsWith('email')?'email-address':path.endsWith('phone')?'phone-pad':path.endsWith('manufacturedYear')?'number-pad':'default'} autoCapitalize={path.endsWith('email')?'none':'sentences'} autoCorrect={!path.endsWith('email')&&!path.endsWith('serial')} inputAccessoryViewID="customer-keyboard" style={{...text,minHeight:48,padding:12,backgroundColor:theme.surface,borderColor:theme.border,borderWidth:invalid(path)?2:1,borderRadius:10}}/>{invalid(path)?<Text accessibilityRole="alert" style={text}>{i18n.t('customer.fieldError')}</Text>:null}</View>;}
 function toggle(path:string,value:boolean){return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><Text style={{...text,flex:1}}>{i18n.t(customerFieldLabel(path))}</Text><Switch accessibilityLabel={i18n.t(customerFieldLabel(path))} value={value} onValueChange={value=>change(path.split('.').at(-1)!,value)}/></View>;}
 function pick(path:string,value:string,options:Choice['options']){return <View style={{gap:6}}><Text style={text}>{i18n.t(customerFieldLabel(path))} · {i18n.t('customer.required')}</Text><Button title={options.find(option=>option.value===value)?.label||i18n.t('customer.select')} color={theme.accent} onPress={()=>{Keyboard.dismiss();setSearch('');setChoice({path,value,options});}}/>{invalid(path)?<Text accessibilityRole="alert" style={text}>{i18n.t('customer.fieldError')}</Text>:null}</View>;}
 const display=(value:string|boolean|null,path:string)=>value===null?i18n.t('customer.absent'):typeof value==='boolean'?i18n.t(value?'customer.yes':'customer.no'):!value?i18n.t('customer.empty'):path.endsWith('.form')?i18n.t(`customer.form.${value}` as MessageKey):value;
 return <KeyboardAvoidingView style={{flex:1,backgroundColor:theme.background}} behavior={Platform.OS==='android'?'height':undefined}><ScrollView ref={scroll} contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:20,paddingBottom:48}}>
 <Text accessibilityRole="header" style={heading}>{i18n.t(section?.kind==='locations'?'customer.locations':section?.kind==='pianos'?'customer.pianos':'customer.heading')}</Text>
 {loading?<Text style={text}>{i18n.t('common.loading')}</Text>:!state?<><Text accessibilityRole="alert" style={text}>{i18n.t(failure??'customer.access')}</Text><Button title={i18n.t('customer.retry')} onPress={retry}/></>:<>
 <Text style={{...text,color:theme.secondary}}>{i18n.t('customer.intro')}</Text>
 {workspace?.restored&&(state.dirty||state.pending||state.conflict)?<Text style={text}>{i18n.t('customer.restored')}</Text>:null}
 {workspace?.recoveryNotice?<Text style={text}>{i18n.t(workspace.recoveryNotice==='expired'?'customer.expired':'customer.invalidDraft')}</Text>:null}
 <Text accessibilityLiveRegion="polite" style={text}>{i18n.t(storageFailure?'customer.storage':writes?'customer.savingDraft':state.failure?`customer.${state.failure}` as MessageKey:state.busy?'customer.saving':state.pending?'customer.uncertain':state.conflict?'customer.conflict':state.dirty?(edited||workspace?.restored?'customer.draftReady':'customer.start'):'customer.saved')}</Text>
 {storageFailure||state.failure==='storage'?<Button title={i18n.t('customer.retry')} onPress={()=>void edit(state.draft)}/>:null}
 {!section?<>
 <Text accessibilityRole="header" style={heading}>{i18n.t('customer.contact')}</Text>{toggle('isBusiness',state.draft.isBusiness)}
 {customerContactFields.filter(f=>f.key!=='businessName'||state.draft.isBusiness||!!state.draft.businessName||invalid('businessName')).map(f=>field(f.key,state.draft[f.key],f.key==='businessName'?state.draft.isBusiness:f.required,f.max))}
 <Text accessibilityRole="header" style={heading}>{i18n.t('customer.locations')}</Text>
 {state.draft.locations.map(row=><Pressable key={row.key} accessibilityRole="button" onPress={()=>void select({kind:'locations',key:row.key})} style={{padding:16,minHeight:52,borderRadius:12,backgroundColor:theme.surface}}><Text style={text}>{row.label||i18n.t('customer.newLocation')}</Text><Text style={{...text,color:theme.secondary}}>{[row.street1,row.city].filter(Boolean).join(', ')}</Text></Pressable>)}
 {!state.draft.locations.length?<Text style={text}>{i18n.t('customer.firstLocation')}</Text>:null}<Button color={theme.accent} title={i18n.t('customer.addLocation')} disabled={state.draft.locations.length>=50} onPress={()=>void add('locations')}/>
 <Text accessibilityRole="header" style={heading}>{i18n.t('customer.pianos')}</Text>
 {state.draft.pianos.map(row=><Pressable key={row.key} accessibilityRole="button" onPress={()=>void select({kind:'pianos',key:row.key})} style={{padding:16,minHeight:52,borderRadius:12,backgroundColor:theme.surface}}><Text style={text}>{row.nickname||i18n.t('customer.newPiano')}</Text><Text style={{...text,color:theme.secondary}}>{state.draft.locations.find(l=>l.key===row.locationKey)?.label}</Text></Pressable>)}
 {!state.draft.pianos.length?<Text style={text}>{i18n.t('customer.noPianos')}</Text>:null}<Button color={theme.accent} title={i18n.t('customer.addPiano')} disabled={!state.draft.locations.length||state.draft.pianos.length>=200} onPress={()=>void add('pianos')}/>
 </>:location?<>
 {customerLocationFields.map(f=>field(`locations.${location.key}.${f.key}`,location[f.key],f.required,f.max))}
 {pick(`locations.${location.key}.timezone`,location.timezone,(workspace?.timezones()??[]).map(value=>({value,label:value})))}
 {state.draft.locations.length<=1||state.draft.pianos.some(row=>row.locationKey===location.key)?<Text style={text}>{i18n.t('customer.cannotRemoveLocation')}</Text>:<Button title={i18n.t('customer.remove')} onPress={remove}/>}
 </>:piano?<>
 {customerPianoFields.map(f=>field(`pianos.${piano.key}.${f.key}`,piano[f.key],f.required,f.max))}
 {pick(`pianos.${piano.key}.locationKey`,piano.locationKey,state.draft.locations.map((row,index)=>({value:row.key,label:[row.label||i18n.t('customer.newLocation'),row.street1,row.city].filter(Boolean).join(', ')+i18n.t('customer.locationPosition',{number:i18n.number(index+1)})})))}
 {pick(`pianos.${piano.key}.form`,piano.form,customerPianoForms.map(value=>({value,label:i18n.t(`customer.form.${value}`)})))}
 {toggle(`pianos.${piano.key}.player`,piano.player)}<Button title={i18n.t('customer.remove')} onPress={remove}/>
 </>:null}
 {showIssues&&state.issues.length?<View style={{gap:8}}><Text accessibilityRole="alert" style={text}>{i18n.t('customer.invalid')}</Text>{state.issues.map(issue=><Button key={issue.path} title={i18n.t(customerFieldLabel(issue.path))} onPress={()=>focusIssue(issue.path)}/>)}</View>:null}
 {state.conflict?<Button title={i18n.t('customer.review')} disabled={state.busy} onPress={()=>void workspace?.editor.review()}/>:null}
 {state.latest?<View style={{gap:16}}>{customerComparison(state.latest.attributes,state.draft).map(difference=><View key={difference.path} style={{gap:8}}><Text accessibilityRole="header" style={text}>{difference.context} {i18n.t(customerFieldLabel(difference.path))}</Text><Text style={text}>{i18n.t('customer.current')}</Text><Text style={text}>{display(difference.current,difference.path)+(difference.currentLocationPosition?i18n.t('customer.locationPosition',{number:i18n.number(difference.currentLocationPosition)}):'')}</Text><Text style={text}>{i18n.t('customer.yours')}</Text><Text style={text}>{display(difference.yours,difference.path)+(difference.yoursLocationPosition?i18n.t('customer.locationPosition',{number:i18n.number(difference.yoursLocationPosition)}):'')}</Text></View>)}<Button title={i18n.t('customer.keep')} disabled={state.busy} onPress={()=>void workspace?.editor.keepEdits()}/><Button title={i18n.t('customer.useLatest')} disabled={state.busy} onPress={()=>{setSection(null);void workspace?.editor.useLatest();}}/></View>:null}
 <Button color={theme.accent} title={i18n.t(state.pending?'customer.retrySave':'customer.save')} disabled={state.busy||state.conflict||writes>0||!!leaving} onPress={()=>void save()}/>
 </>}
 </ScrollView>
 {Platform.OS==='ios'?<InputAccessoryView nativeID="customer-keyboard"><View style={{backgroundColor:theme.surface,alignItems:'flex-end'}}><Button title={i18n.t('customer.done')} onPress={Keyboard.dismiss}/></View></InputAccessoryView>:null}
 {state?<Modal visible={!!choice} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setChoice(null)}><SafeAreaView style={{flex:1,backgroundColor:theme.background,padding:20}}><Button title={i18n.t('customer.done')} onPress={()=>setChoice(null)}/><Text accessibilityRole="header" style={heading}>{choice?i18n.t(customerFieldLabel(choice.path)):''}</Text><TextInput accessibilityLabel={i18n.t(choice?.path.endsWith('.timezone')?'customer.searchTimezone':'customer.select')} value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" style={{...text,minHeight:48,borderWidth:1,borderColor:theme.border,padding:12,marginVertical:16}}/><FlatList keyboardShouldPersistTaps="handled" data={state?choice?.options.filter(option=>option.label.toLocaleLowerCase(i18n.locale).includes(search.toLocaleLowerCase(i18n.locale)))??[]:[]} keyExtractor={option=>option.value} renderItem={({item})=><Pressable accessibilityRole="radio" accessibilityState={{selected:item.value===choice?.value}} onPress={()=>{if(choice)change(choice.path.split('.').at(-1)!,item.value);setChoice(null);}} style={{minHeight:52,padding:14,borderBottomWidth:1,borderColor:theme.border,backgroundColor:item.value===choice?.value?theme.surface:theme.background}}><Text style={text}>{item.label}</Text></Pressable>}/></SafeAreaView></Modal>:null}
 </KeyboardAvoidingView>;
}
