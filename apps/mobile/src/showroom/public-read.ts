import {useCallback,useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
type PublicModel<S>={snapshot():S;subscribe(listener:(state:S)=>void):()=>void;refresh():Promise<unknown>;clear():void};
/** Focus and foreground are the lifetime of a public projection, including media. */
export function usePublicState<S>(model:PublicModel<S>):S{
 const [observed,setObserved]=useState({model,state:model.snapshot()});
 useEffect(()=>model.subscribe(state=>setObserved({model,state})),[model]);
 useFocusEffect(useCallback(()=>{
  if(AppState.currentState==='active')void model.refresh();
  const subscription=AppState.addEventListener('change',state=>{if(state==='active')void model.refresh();else model.clear();});
  return()=>{subscription.remove();model.clear();};
 },[model]));
 return observed.model===model?observed.state:model.snapshot();
}
