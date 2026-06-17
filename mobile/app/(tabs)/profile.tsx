import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { Button, Card } from '../../src/components/ui';
import { Colors, Spacing, FontSize } from '../../src/components/theme';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive', onPress: async () => {
          await logout();
          router.replace('/(auth)/index');
        }
      },
    ]);
  };

  const xpToNext = (user?.accountLevel ?? 1) * 200;
  const curXp = ((user?.accountLevel ?? 1) - 1) * 200;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? '?'}</Text></View>
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>
      <View style={styles.stats}>
        <Card style={styles.statCard}><Text style={[styles.statValue, { color: Colors.primary }]}>{user?.elo ?? 1200}</Text><Text style={styles.statLabel}>ELO</Text></Card>
        <Card style={styles.statCard}><Text style={[styles.statValue, { color: Colors.info }]}>{user?.accountLevel ?? 1}</Text><Text style={styles.statLabel}>Level</Text></Card>
      </View>
      <Card style={styles.levelCard}>
        <Text style={styles.levelLabel}>Level {user?.accountLevel ?? 1}</Text>
        <View style={styles.xpBar}><View style={[styles.xpFill, { width: (Math.min(100, (curXp / xpToNext) * 100)) + '%' }]} /></View>
        <Text style={styles.xpText}>{curXp} / {xpToNext} XP</Text>
      </Card>
      <View style={styles.footer}>
        <Button title="Log Out" onPress={handleLogout} variant="ghost" size="lg" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { alignItems: 'center', padding: Spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  avatarText: { color: Colors.textPrimary, fontSize: 36, fontWeight: '800' },
  username: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  email: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 4 },
  stats: { flexDirection: 'row', padding: Spacing.lg, gap: Spacing.md },
  statCard: { flex: 1, alignItems: 'center', padding: Spacing.md },
  statValue: { fontSize: FontSize.xxl, fontWeight: '900' },
  statLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 4 },
  levelCard: { marginHorizontal: Spacing.lg },
  levelLabel: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600', marginBottom: Spacing.sm },
  xpBar: { height: 8, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  xpText: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: Spacing.xs },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.lg },
});
