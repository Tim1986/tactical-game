import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Modal, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMatches, getChallenges, acceptChallenge, declineChallenge, getTeams, MatchSummary, Team } from '../../src/api/client';
import { useAuthStore } from '../../src/store/authStore';
import { Card, Badge, EmptyState, SectionHeader, Button, ErrorMessage } from '../../src/components/ui';
import { Colors, Spacing, FontSize, Radius } from '../../src/components/theme';

interface ChallengeItem {
  id: string;
  fromUserId: string;
  fromUsername: string;
  teamId: string;
  status: string;
  createdAt: string;
  expiresAt?: string;
}

interface SentChallengeItem {
  id: string;
  toUserId: string;
  toUsername: string;
  teamId: string;
  status: string;
  matchId: string | null;
  createdAt: string;
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [sentChallenges, setSentChallenges] = useState<SentChallengeItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Accept modal state
  const [acceptModal, setAcceptModal] = useState(false);
  const [acceptingChallenge, setAcceptingChallenge] = useState<ChallengeItem | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [matchResult, challengeResult] = await Promise.all([
        getMatches(),
        getChallenges(),
      ]);
      setMatches(matchResult.matches);
      setChallenges(challengeResult.challenges ?? []);
      setSentChallenges((challengeResult as unknown as { sent?: SentChallengeItem[] }).sent ?? []);
    } catch { }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openAcceptModal = async (challenge: ChallengeItem) => {
    setAcceptingChallenge(challenge);
    setAcceptError(null);
    setSelectedTeamId(null);
    try {
      const result = await getTeams();
      setTeams(result.teams);
      if (result.teams.length > 0) setSelectedTeamId(result.teams[0].id);
    } catch { setTeams([]); }
    setAcceptModal(true);
  };

  const handleAccept = async () => {
    if (!acceptingChallenge || !selectedTeamId) return;
    setAcceptLoading(true); setAcceptError(null);
    try {
      const result = await acceptChallenge(acceptingChallenge.id, selectedTeamId);
      setAcceptModal(false);
      await load();
      router.push({ pathname: '/match/[id]', params: { id: result.matchId } });
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to accept');
    } finally { setAcceptLoading(false); }
  };

  const handleDecline = (challenge: ChallengeItem) => {
    const doDecline = async () => {
      try {
        await declineChallenge(challenge.id);
        await load();
      } catch { }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Decline challenge from ' + challenge.fromUsername + '?')) void doDecline();
    } else {
      Alert.alert('Decline Challenge', 'Decline challenge from ' + challenge.fromUsername + '?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => void doDecline() },
      ]);
    }
  };

  const activeMatches = matches.filter((m) => m.status === 'active');
  const completedMatches = matches.filter((m) => m.status !== 'active').slice(0, 5);
  const pendingSent = sentChallenges.filter((c) => c.status === 'pending');

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

      <FlatList
        data={[]}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListHeaderComponent={
          <View style={styles.content}>

            {/* Pending challenges received — shown first, most urgent */}
            {challenges.length > 0 && (
              <>
                <SectionHeader title={'Challenges (' + challenges.length + ')'} />
                {challenges.map((c) => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    onAccept={() => void openAcceptModal(c)}
                    onDecline={() => handleDecline(c)}
                  />
                ))}
              </>
            )}

            {/* Active matches */}
            <SectionHeader title={'Active Matches (' + activeMatches.length + ')'} />
            {activeMatches.length === 0
              ? <EmptyState message="No active matches. Head to Play to find an opponent!" />
              : activeMatches.map((m) => <MatchCard key={m.id} match={m} myId={user?.id ?? ''} />)
            }

            {/* Sent challenges still pending */}
            {pendingSent.length > 0 && (
              <>
                <SectionHeader title={'Awaiting Response (' + pendingSent.length + ')'} />
                {pendingSent.map((c) => (
                  <Card key={c.id} style={styles.sentCard}>
                    <Text style={styles.sentTitle}>Challenge sent to <Text style={styles.sentName}>{c.toUsername}</Text></Text>
                    <Text style={styles.sentDate}>Sent {new Date(c.createdAt).toLocaleDateString()}</Text>
                  </Card>
                ))}
              </>
            )}

            {/* Recent results */}
            {completedMatches.length > 0 && (
              <>
                <SectionHeader title="Recent Results" />
                {completedMatches.map((m) => <MatchCard key={m.id} match={m} myId={user?.id ?? ''} />)}
              </>
            )}
          </View>
        }
      />

      {/* Accept Challenge Modal */}
      <Modal visible={acceptModal} animationType="slide" transparent onRequestClose={() => setAcceptModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Accept Challenge</Text>
            {acceptingChallenge && (
              <Text style={styles.modalSub}>
                <Text style={styles.modalName}>{acceptingChallenge.fromUsername}</Text> has challenged you. Pick your team:
              </Text>
            )}
            {acceptError && <ErrorMessage message={acceptError} />}
            {teams.length === 0
              ? <Text style={styles.noTeams}>You need to create a team first in the Teams tab.</Text>
              : teams.map((t) => (
                <TouchableOpacity key={t.id} onPress={() => setSelectedTeamId(t.id)}>
                  <Card style={[styles.teamCard, selectedTeamId === t.id && styles.teamSelected]}>
                    <View style={styles.teamRow}>
                      <View>
                        <Text style={styles.teamName}>{t.name}</Text>
                        <Text style={styles.teamSub}>{t.unitIds.length} units</Text>
                      </View>
                      {selectedTeamId === t.id && <Text style={styles.teamCheck}>✓</Text>}
                    </View>
                  </Card>
                </TouchableOpacity>
              ))
            }
            <View style={styles.modalBtns}>
              <Button title="Accept" onPress={handleAccept} loading={acceptLoading} disabled={!selectedTeamId || teams.length === 0} size="lg" />
              <Button title="Cancel" onPress={() => setAcceptModal(false)} variant="ghost" size="lg" />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ChallengeCard({ challenge, onAccept, onDecline }: { challenge: ChallengeItem; onAccept: () => void; onDecline: () => void }) {
  return (
    <Card style={styles.challengeCard}>
      <View style={styles.challengeRow}>
        <View style={styles.challengeInfo}>
          <Text style={styles.challengeFrom}>{challenge.fromUsername}</Text>
          <Text style={styles.challengeDate}>challenged you · {new Date(challenge.createdAt).toLocaleDateString()}</Text>
        </View>
        <Badge label="CHALLENGE" color={Colors.warning} />
      </View>
      <View style={styles.challengeBtns}>
        <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
          <Text style={styles.acceptTxt}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
          <Text style={styles.declineTxt}>Decline</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

function MatchCard({ match, myId }: { match: MatchSummary; myId: string }) {
  const isActive = match.status === 'active';
  const iWon = match.winnerId === myId;
  return (
    <TouchableOpacity onPress={() => router.push({ pathname: '/match/[id]', params: { id: match.id } })}>
      <Card style={[styles.matchCard, match.isMyTurn && styles.myTurnCard]}>
        <View style={styles.matchRow}>
          <View>
            <Text style={styles.matchTitle}>{isActive ? 'Turn ' + match.turnNumber : (iWon ? 'Victory' : 'Defeat')}</Text>
            <Text style={styles.matchDate}>{new Date(match.createdAt).toLocaleDateString()}</Text>
          </View>
          <Badge
            label={isActive ? (match.isMyTurn ? 'YOUR TURN' : 'WAITING') : (iWon ? 'WIN' : 'LOSS')}
            color={isActive ? (match.isMyTurn ? Colors.success : Colors.textMuted) : (iWon ? Colors.success : Colors.danger)}
          />
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

  // Challenge cards
  challengeCard: { marginBottom: Spacing.sm, borderColor: Colors.warning },
  challengeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  challengeInfo: { flex: 1 },
  challengeFrom: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  challengeDate: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  challengeBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  acceptBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.sm, alignItems: 'center' },
  acceptTxt: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing.sm, alignItems: 'center' },
  declineTxt: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },

  // Match cards
  matchCard: { marginBottom: Spacing.sm },
  myTurnCard: { borderColor: Colors.primary },
  matchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  matchDate: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  turnPrompt: { color: Colors.primary, fontSize: FontSize.sm, marginTop: Spacing.xs },

  // Sent challenges
  sentCard: { marginBottom: Spacing.sm, opacity: 0.7 },
  sentTitle: { color: Colors.textSecondary, fontSize: FontSize.sm },
  sentName: { color: Colors.textPrimary, fontWeight: '600' },
  sentDate: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },

  // Accept modal
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.xl, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  modalTitle: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800' },
  modalSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.xs },
  modalName: { color: Colors.textPrimary, fontWeight: '700' },
  noTeams: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', padding: Spacing.md },
  teamCard: { marginBottom: Spacing.sm },
  teamSelected: { borderColor: Colors.primary },
  teamRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  teamSub: { color: Colors.textSecondary, fontSize: FontSize.sm },
  teamCheck: { color: Colors.primary, fontSize: FontSize.xl, fontWeight: '800' },
  modalBtns: { gap: Spacing.sm, marginTop: Spacing.sm },
});
