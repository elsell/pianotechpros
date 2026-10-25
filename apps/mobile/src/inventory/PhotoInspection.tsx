import {NativeButton as Button} from '../native-button';
import {useEffect,useRef,useState} from 'react';
import {Image,PanResponder,Platform,ScrollView,Text,View,type GestureResponderEvent} from 'react-native';
import {createPhotoViewport} from '@pianotechpros/client-core';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';

export function PhotoInspection({uri,alt,onError}:{uri:string;alt:string;onError:()=>void}){
 const {i18n}=useMobileSession();const theme=useNativeTheme();const [geometry]=useState(createPhotoViewport);
 const [viewport,setViewport]=useState({width:0,height:0});const [image,setImage]=useState({width:1,height:1});
 const [transform,setTransform]=useState(geometry.snapshot());const [nativeScale,setNativeScale]=useState(1);
 const scroll=useRef<ScrollView>(null);const native=useRef({scale:1,x:0,y:0});
 useEffect(()=>{geometry.resize(viewport.width,viewport.height,image.width,image.height);setTransform(geometry.snapshot());native.current={scale:1,x:0,y:0};setNativeScale(1);},[geometry,viewport,image]);
 const [pan]=useState(()=>{
  const move=(event:GestureResponderEvent)=>{geometry.move(event.nativeEvent.touches.map(t=>({id:Number(t.identifier),x:t.locationX,y:t.locationY})));setTransform(geometry.snapshot());};
  return PanResponder.create({onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,onPanResponderGrant:move,onPanResponderMove:move,onPanResponderRelease:()=>geometry.end(),onPanResponderTerminate:()=>geometry.end(),onPanResponderTerminationRequest:()=>true});
 });
 const scale=Platform.OS==='ios'?nativeScale:transform.scale;
 function zoom(next:number){
  const target=Math.max(1,Math.min(4,next));
  if(Platform.OS==='ios'){
   const current=native.current;const width=viewport.width/target,height=viewport.height/target;
   const centerX=(current.x+viewport.width/2)/current.scale,centerY=(current.y+viewport.height/2)/current.scale;
   scroll.current?.scrollResponderZoomTo({x:Math.max(0,Math.min(transform.width-width,centerX-width/2)),y:Math.max(0,Math.min(transform.height-height,centerY-height/2)),width,height,animated:false});
  }else{geometry.zoom(target);setTransform(geometry.snapshot());}
 }
 const imageProps={source:{uri},resizeMode:'contain' as const,onError,onLoad:(event:{nativeEvent:{source:{width:number;height:number}}})=>{const size=event.nativeEvent.source;setImage(previous=>previous.width===size.width&&previous.height===size.height?previous:{width:size.width,height:size.height});}};
 return <View style={{flex:1,gap:12}}>
 <View style={{flex:1,overflow:'hidden',backgroundColor:theme.surface}} onLayout={event=>{const {width,height}=event.nativeEvent.layout;setViewport(previous=>previous.width===width&&previous.height===height?previous:{width,height});}}>
 {viewport.width>0&&viewport.height>0?(Platform.OS==='ios'?<ScrollView key={JSON.stringify([viewport.width,viewport.height,image.width,image.height])} ref={scroll} style={{flex:1}} centerContent minimumZoomScale={1} maximumZoomScale={4} pinchGestureEnabled bouncesZoom contentInsetAdjustmentBehavior="never" showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={event=>{const {zoomScale,contentOffset}=event.nativeEvent;native.current={scale:Math.max(1,Math.min(4,zoomScale)),x:contentOffset.x,y:contentOffset.y};setNativeScale(native.current.scale);}}><Image {...imageProps} accessibilityLabel={alt||i18n.t('inventory.photos.heading')} style={{width:transform.width||viewport.width,height:transform.height||viewport.height}} /></ScrollView>
 :<View {...pan.panHandlers} accessibilityRole="adjustable" accessible accessibilityLabel={alt||i18n.t('inventory.photos.heading')} accessibilityHint={i18n.t('inventory.photos.zoomHint')} accessibilityValue={{min:100,max:400,now:Math.round(scale*100)}} accessibilityActions={[{name:'increment',label:i18n.t('inventory.photos.zoomIn')},{name:'decrement',label:i18n.t('inventory.photos.zoomOut')}]} onAccessibilityAction={event=>{if(event.nativeEvent.actionName==='increment')zoom(scale+0.5);if(event.nativeEvent.actionName==='decrement')zoom(scale-0.5);}} style={{flex:1,alignItems:'center',justifyContent:'center'}}><View pointerEvents="none" style={{width:transform.width||viewport.width,height:transform.height||viewport.height,transform:[{translateX:transform.x},{translateY:transform.y},{scale:transform.scale}]}}><Image {...imageProps} accessible={false} style={{width:'100%',height:'100%'}} /></View></View>):null}
 </View>
 <Text style={{color:theme.secondary,textAlign:'center'}}>{i18n.t('inventory.photos.zoomLevel',{level:i18n.number(Math.round(scale*100))})}</Text>
 <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:8}}><Button title={i18n.t('inventory.photos.zoomOut')}  disabled={scale<=1.001} onPress={()=>zoom(scale-0.5)} /><Button title={i18n.t('inventory.photos.zoomReset')}  disabled={scale<=1.001} onPress={()=>zoom(1)} /><Button title={i18n.t('inventory.photos.zoomIn')}  disabled={scale>=3.999} onPress={()=>zoom(scale+0.5)} /></View>
 <Text style={{color:theme.secondary,textAlign:'center',paddingHorizontal:16}}>{i18n.t('inventory.photos.zoomHint')}</Text>
 </View>;
}
