import { useColorScheme } from 'react-native';
export function useNativeTheme() {
  return useColorScheme() === 'dark'
    ? { statusBarStyle: 'light' as const, background: '#111815', surface: '#1c2721', text: '#f1f5f2', secondary: '#b8c9bf', border: '#42574a', accent: '#9cddb6' }
    : { statusBarStyle: 'dark' as const, background: '#f4f6f3', surface: '#ffffff', text: '#162b20', secondary: '#52645a', border: '#cbd7ce', accent: '#245b43' };
}
