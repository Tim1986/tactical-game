import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMatches, MatchSummary } from '../../src/api/client';
import { useAuthStore } from '../../src/store/authStore';
import { Card, Badge, EmptyState, SectionHeader } from '../../src/components/ui';
import { Colors, Spacing, FontSize } from '../../src/components/theme';

export default function HomeScreen() {
  const { user } = useAuthStore();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { const result = await getMatches(); setMatches(result.matches); } catch { } }, []);
  useEffect(() => { void load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const activeMatches = matches.filter((m) => m.status === 'active');
  const completedMatches = matches.filter((m) => m.status !== 'active').slice(0, 5);
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.username}>{user?.username}</Text>
        <View style={styles.eloRow}>
          <Badge label={'ELO ' + (user?.elo ?? 1200)} color={Colors.primary} />
          <Badge label={'Lv ' + (user?.accountLevel ?? 1)} color={Colors.info} />
        </View>
      </View>
      <FlatList data={[]} renderItem={null} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListHeaderComponent={
          <View style={styles.content}>
            <SectionHeader title={'Active Matches (' + activeMatches.length + ')'} />
            {activeMatches.length === 0 ? <EmptyState message="No active matches. Head to Play to find an opponent!" /> : activeMatches.map((m) => <MatchCard key={m.id} match={m} myId={user?.id ?? ''} />)}
            {completedMatches.length > 0 && (<><SectionHeader title="Recent Results" />{completedMatches.map((m) => <MatchCard key={m.id} match={m} myId={user?.id ?? ''} />)}</>)}
          </View>
        }
      />
    </SafeAreaView>
  );
}
function MatchCard({ match, myId }: { match: MatchSummary; myId: string }) {
  const isActive = match.status === 'active';
  const iWon = match.winnerId === myId;
  return (
    <TouchableOpacity onPress={() => router.push('/match/' + match.id)}>
      <Card style={[styles.matchCard, match.isMyTurn && styles.myTurnCard]}>
        <View style={styles.matchRow}>
          <View><Text style={styles.matchTitle}>{isActive ? 'Turn ' + match.turnNumber : (iWon ? 'Victory' : 'Defeat')}</Text><Text style={styles.matchDate}>{new Date(match.createdAt).toLocaleDateString()}</Text></View>
          <Badge label={isActive ? (match.isMyTurn ? 'YOUR TURN' : 'WAITING') : (iWon ? 'WIN' : 'LOSS')} color={isActive ? (match.isMyTurn ? Colors.success : Colors.textMuted) : (iWon ? Colors.success : Colors.danger)} />
        </View>
        {match.isMyTurn && <Text style={styles.turnPrompt}>Tap to make your move</Text>}
      </Card>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: Spacing.lg, paddingBottom: 0 },
  greeting: { color: Colors.textSecondary, fontSize: FontSize.md },
  username: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800', marginTop: 2 },
  eloRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  content: { padding: Spacing.lg },
  matchCard: { marginBottom: Spacing.sm },
  myTurnCard: { borderColor: Colors.primary },
  matchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  matchDate: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  turnPrompt: { color: Colors.primary, fontSize: FontSize.sm, marginTop: Spacing.xs },
});
