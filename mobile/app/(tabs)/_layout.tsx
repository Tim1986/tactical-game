import { useEffect } from "react";
import { Tabs, router } from "expo-router";
import { Text, View, ActivityIndicator } from "react-native";
import { useAuthStore } from "../../src/store/authStore";
import { Colors } from "../../src/components/theme";

export default function TabsLayout() {
  const { user, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/(auth)/index');
  }, [user, isLoading]);

  // Render nothing while loading or if user is gone — prevents the flash
  if (isLoading || !user) {
    return <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={Colors.primary} /></View>;
  }

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
