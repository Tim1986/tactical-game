import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import { registerPushToken } from '../src/api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

export default function RootLayout() {
  const { user, loadUser } = useAuthStore();

  useEffect(() => { void loadUser(); }, []);
  useEffect(() => { if (user) void registerForPushNotifications(); }, [user]);
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      if (data.matchId) router.push('/match/' + data.matchId);
    });
    return () => sub.remove();
  }, []);
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
