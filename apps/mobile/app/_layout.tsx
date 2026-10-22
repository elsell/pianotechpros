import { Stack } from 'expo-router';
import { MobileSessionProvider, useMobileSession } from '../src/session-provider';
import { useNativeTheme } from '../src/native-theme';
function Navigation() {
  const { i18n } = useMobileSession();
  const theme = useNativeTheme();
  return <Stack screenOptions={{ headerTintColor: theme.text, headerStyle: { backgroundColor: theme.surface }, contentStyle: { backgroundColor: theme.background } }}>
    <Stack.Screen name="index" options={{ title: i18n.t('app.title') }} />
    <Stack.Screen name="dealers/[id]" options={{ title: i18n.t('dealer.heading') }} />
  </Stack>;
}
export default function Layout() { return <MobileSessionProvider><Navigation /></MobileSessionProvider>; }
