import { useColorScheme } from 'react-native';
import {nativePalette} from './native-palette';
export function useNativeTheme() {
 return nativePalette(useColorScheme()==='dark');
}
