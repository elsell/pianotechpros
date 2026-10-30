import {forwardRef,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {TextInput,type TextInputProps} from 'react-native';
import {createNativeTextEntry} from './native-text-entry';
type Props=Omit<TextInputProps,'value'|'defaultValue'|'onChangeText'>&{value:string;readCurrentValue():string;onChangeText(value:string):void};
export const NativeTextInput=forwardRef<TextInput,Props>(function NativeTextInput({value,readCurrentValue,onChangeText,onFocus,onBlur,...props},ref){
 const native=useRef<TextInput>(null);
 const current=useRef({readCurrentValue,onChangeText});
 useLayoutEffect(()=>{current.current={readCurrentValue,onChangeText};},[readCurrentValue,onChangeText]);
 const [entry]=useState(()=>createNativeTextEntry({read:()=>current.current.readCurrentValue(),write:text=>native.current?.setNativeProps({text}),change:text=>current.current.onChangeText(text)}));
 useImperativeHandle(ref,()=>native.current!,[]);
 useLayoutEffect(()=>{entry.synchronize();},[entry,value,readCurrentValue]);
 return <TextInput {...props} ref={native} defaultValue={entry.initial} onChangeText={entry.change} onFocus={event=>{entry.begin();onFocus?.(event);}} onBlur={event=>{entry.end();onBlur?.(event);}}/>;
});
