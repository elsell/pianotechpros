import {Platform,Text,TouchableNativeFeedback,TouchableOpacity,View,type ButtonProps} from 'react-native';
import {useNativeTheme} from './native-theme';
import {nativeButtonColor} from './native-palette';
export function NativeButton({tone='primary',title,disabled,accessibilityState,...props}:Omit<ButtonProps,'color'>&{tone?:'primary'|'destructive'}){
 const theme=useNativeTheme();const android=Platform.OS==='android';
 const inactive=disabled??accessibilityState?.disabled;
 const color=nativeButtonColor(theme,Platform.OS,tone);
 const Touchable=android?TouchableNativeFeedback:TouchableOpacity;
 return <Touchable {...props} accessibilityRole="button" accessibilityState={{...accessibilityState,disabled:inactive}} disabled={inactive}>
  <View style={{minHeight:android?48:44,minWidth:android?48:44,justifyContent:'center',alignItems:'center',borderRadius:android?2:0,backgroundColor:android?(inactive?theme.border:color):'transparent',elevation:android&&!inactive?4:0}}>
   <Text style={{margin:8,textAlign:'center',fontSize:android?14:18,fontWeight:android?'500':'400',color:inactive?theme.secondary:android?'#ffffff':color}}>{android?title.toUpperCase():title}</Text>
  </View>
 </Touchable>;
}
