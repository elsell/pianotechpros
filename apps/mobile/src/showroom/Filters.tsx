import {useState} from 'react';
import {Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {inventoryCurrencies,inventoryForms,type ShowroomFilterFields} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {NativeButton} from '../native-button';
import {NativeChoiceIndicator} from '../native-choice-indicator';
type Choice='form'|'availability'|'currency';
export function PublicFilters({initial,close,apply}:{initial:ShowroomFilterFields;close():void;apply(fields:ShowroomFilterFields):void}){
 const {i18n}=useMobileSession();const theme=useNativeTheme();const [fields,setFields]=useState({...initial});const [choice,setChoice]=useState<Choice|null>(null);
 const text={color:theme.text,fontSize:17};const t=(key:string)=>i18n.t(`showroom.${key}` as MessageKey);
 const values=(field:Choice):readonly string[]=>field==='form'?['',...inventoryForms.filter(Boolean)]:field==='currency'?['',...inventoryCurrencies]:['','all','available','reserved','sold'];
 const label=(field:Choice,value:string)=>field==='currency'?value||t('anyCurrency'):field==='form'?value?i18n.t(`inventory.form.${value}` as MessageKey):t('anyType'):!value?t('available'):value==='all'?t('all'):i18n.t(`inventory.status.${value}` as MessageKey);
 return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaView style={{flex:1,backgroundColor:theme.background}} accessibilityViewIsModal onAccessibilityEscape={close}>
 <View style={{padding:16,gap:8}}><Text accessibilityRole="header" style={{...text,fontSize:24,fontWeight:'600'}}>{t('filters')}</Text><NativeButton title={i18n.t('inventory.photos.cancel')} onPress={close}/></View>
 <KeyboardAvoidingView style={{flex:1}} enabled={Platform.OS==='android'} behavior="height"><ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
 {(['form','availability','currency'] as const).map(field=><View key={field} style={{gap:8}}><Pressable accessibilityRole="button" accessibilityLabel={t(field)} accessibilityValue={{text:label(field,fields[field]??'')}} accessibilityState={{expanded:choice===field}} onPress={()=>{Keyboard.dismiss();setChoice(choice===field?null:field);}} style={{minHeight:52,padding:16,borderRadius:12,backgroundColor:theme.surface}}><Text style={{color:theme.secondary,fontSize:15}}>{t(field)}</Text><Text style={text}>{label(field,fields[field]??'')}</Text></Pressable>
 {choice===field?values(field).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={label(field,value)} accessibilityState={{checked:(fields[field]??'')===value}} onPress={()=>{setFields(old=>({...old,[field]:value}));setChoice(null);}} style={{minHeight:52,padding:12,flexDirection:'row',alignItems:'center'}}><NativeChoiceIndicator checked={(fields[field]??'')===value}/><Text style={{...text,flex:1}}>{label(field,value)}</Text></Pressable>):null}</View>)}
 <Text style={{color:theme.secondary,fontSize:16}}>{t('priceHelp')}</Text>
 {(['minimum','maximum'] as const).map(field=><View key={field} style={{gap:8}}><Text style={text}>{t(field)}</Text><TextInput accessibilityLabel={t(field)} value={fields[field]??''} onChangeText={value=>setFields(old=>({...old,[field]:value}))} keyboardType="decimal-pad" maxLength={32} style={{...text,minHeight:52,padding:12,borderWidth:1,borderColor:theme.border,borderRadius:10}}/></View>)}
 <NativeButton title={t('clear')} onPress={()=>{setFields({});setChoice(null);}}/>
 </ScrollView></KeyboardAvoidingView><View style={{padding:16}}><NativeButton title={t('apply')} onPress={()=>{Keyboard.dismiss();apply(fields);}}/></View>
 </SafeAreaView></Modal>;
}
