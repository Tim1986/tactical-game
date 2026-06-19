import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { Colors } from '../../src/components/theme';

export default function TabsLayout() {
  const { user, isLoading } = useAuthStore();

  // If logged out, go straight to auth — no flash
  if (!isLoading && !user) return <Redirect href="/(auth)" />;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: Colors.bgCard, borderTopColor: Colors.border }, tabBarActiveTintColor: Colors.primary, tabBarInactiveTintColor: Colors.textMuted }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 12, fontWeight: "700" }}>HOME</Text> }} />
      <Tabs.Screen name="units" options={{ title: "Units", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 12, fontWeight: "700" }}>UNITS</Text> }} />
      <Tabs.Screen name="teams" options={{ title: "Teams", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 12, fontWeight: "700" }}>TEAMS</Text> }} />
      <Tabs.Screen name="play" options={{ title: "Play", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 12, fontWeight: "700" }}>PLAY</Text> }} />
      <Tabs.Screen name="test" options={{ title: "Test", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 12, fontWeight: "700" }}>TEST</Text> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 12, fontWeight: "700" }}>ME</Text> }} />
    </Tabs>
  );
}
