import { Stack } from 'expo-router';
import { MobileSessionProvider, useMobileSession } from '../src/session-provider';
import { useNativeTheme } from '../src/native-theme';
function Navigation() {
  const { i18n } = useMobileSession();
  const theme = useNativeTheme();
  return <Stack screenOptions={{ statusBarStyle: theme.statusBarStyle, headerTintColor: theme.text, headerStyle: { backgroundColor: theme.surface }, contentStyle: { backgroundColor: theme.background } }}>
    <Stack.Screen name="inventory/[id]" options={{ title: i18n.t('inventory.edit.editor') }} />
    <Stack.Screen name="inventory/index" options={{ title: i18n.t('inventory.heading') }} />
    <Stack.Screen name="scan" options={{ title: i18n.t('scan.native.open'), gestureEnabled:false }} />
    <Stack.Screen name="index" options={{ title: i18n.t('app.title') }} />
    <Stack.Screen name="dealers/staff" options={{ title: i18n.t('staff.heading') }} />
    <Stack.Screen name="dealers/form" options={{ title: i18n.t('dealer.edit') }} />
    <Stack.Screen name="dealers/join" options={{ title: i18n.t('staff.join') }} />
    <Stack.Screen name="dealers/[id]" options={{ title: i18n.t('dealer.heading') }} />
  </Stack>;
}
export default function Layout() { return <MobileSessionProvider><Navigation /></MobileSessionProvider>; }
