import {View} from 'react-native';
import {useNativeTheme} from './native-theme';

/** Decorative only: the containing row owns its label, checked state and action. */
export function NativeChoiceIndicator({checked,multiple=false}:{checked:boolean;multiple?:boolean}){
 const theme=useNativeTheme();
 return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:24,height:24,flexShrink:0,marginEnd:12,borderWidth:2,borderColor:theme.text,borderRadius:multiple?4:12,alignItems:'center',justifyContent:'center'}}>
  {checked?(multiple?<View style={{width:7,height:12,borderRightWidth:2,borderBottomWidth:2,borderColor:theme.text,transform:[{rotate:'45deg'}],marginBottom:3}}/>:<View style={{width:12,height:12,borderRadius:6,backgroundColor:theme.text}}/>):null}
 </View>;
}
