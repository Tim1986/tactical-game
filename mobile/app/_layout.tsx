import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Platform, View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import { registerPushToken } from '../src/api/client';
import { Colors } from '../src/components/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

export default function RootLayout() {
  const { user, isLoading, loadUser } = useAuthStore();

  useEffect(() => { void loadUser(); }, []);
  useEffect(() => { if (user) void registerForPushNotifications(); }, [user]);
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      if (data.matchId) router.push({ pathname: '/match/[id]', params: { id: data.matchId } });
    });
    return () => sub.remove();
  }, []);

  // While checking auth state, show a blank screen — prevents any flash
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="match/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="team/[id]" options={{ presentation: 'card' }} />
    </Stack>
  );
}

async function registerForPushNotifications(): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') { const { status } = await Notifications.requestPermissionsAsync(); finalStatus = status; }
  if (finalStatus !== 'granted') return;
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try { await registerPushToken(tokenData.data, platform); } catch { }
}
