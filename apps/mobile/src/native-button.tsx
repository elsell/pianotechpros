import {Button,Platform,type ButtonProps} from 'react-native';
import {useNativeTheme} from './native-theme';
import {nativeButtonColor} from './native-palette';
export function NativeButton({tone='primary',...props}:Omit<ButtonProps,'color'>&{tone?:'primary'|'destructive'}){
 const theme=useNativeTheme();
 return <Button {...props} color={nativeButtonColor(theme,Platform.OS,tone)}/>;
}
