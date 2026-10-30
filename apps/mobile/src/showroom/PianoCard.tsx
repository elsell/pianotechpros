import {PublicPrice} from './PublicPrice';
import {Pressable,Text,View} from 'react-native';
import type {PublicPiano} from '@pianotechpros/api-client';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {PublicImage} from './PublicImage';
export function PianoCard({slug,piano,open}:{slug:string;piano:PublicPiano;open():void}){
 const {i18n}=useMobileSession();const theme=useNativeTheme();const photo=piano.photos[0];
 return <View style={{backgroundColor:theme.surface,borderRadius:14,overflow:'hidden',marginBottom:16}}>
 {photo?<PublicImage slug={slug} pianoID={piano.id} photoID={photo.id} alt={photo.alt_text||i18n.t('showroom.photo',{title:piano.title,number:1})}/>:null}
 <Pressable accessibilityRole="button" onPress={open} style={({pressed})=>({minHeight:72,padding:16,gap:8,opacity:pressed?.6:1})}>
 <Text style={{color:theme.accent,fontSize:22,fontWeight:'600'}}>{piano.title}</Text><PublicPrice price={piano.price} style={{color:theme.text,fontSize:18}}/><Text style={{color:theme.secondary,fontSize:16}}>{i18n.t(`inventory.status.${piano.status}` as MessageKey)}</Text>
 </Pressable></View>;
}
