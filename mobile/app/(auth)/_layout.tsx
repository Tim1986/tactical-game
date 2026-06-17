import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
export default function AuthLayout() {
  const { user } = useAuthStore();
  useEffect(() => { if (user) router.replace('/(tabs)'); }, [user]);
  return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="index" /><Stack.Screen name="register" /></Stack>;
}
