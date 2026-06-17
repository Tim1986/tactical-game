import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { getTeams, enterQueue, leaveQueue, getQueueStatus, issueChallenge, Team } from '../../src/api/client';
import { Button, Card, EmptyState, ErrorMessage, SectionHeader } from '../../src/components/ui';
import { Colors, Spacing, FontSize } from '../../src/components/theme';

export default function PlayScreen() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [inQueue, setInQueue] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Challenge modal state
  const [challengeModal, setChallengeModal] = useState(false);
  const [challengeHandle, setChallengeHandle] = useState('');
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeSent, setChallengeSent] = useState(false);

  const loadTeams = useCallback(async () => {
    try {
      const result = await getTeams();
      setTeams(result.teams);
      if (result.teams.length > 0 && !selectedTeamId) setSelectedTeamId(result.teams[0].id);
    } catch { }
  }, [selectedTeamId]);

  const checkQueue = useCallback(async () => {
    try {
      const s = await getQueueStatus();
      setInQueue(s.inQueue);
      if (s.waitSeconds !== undefined) setWaitSeconds(s.waitSeconds);
    } catch { }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadTeams();
    void checkQueue();
  }, [loadTeams, checkQueue]));

  const handleEnter = async () => {
    if (!selectedTeamId) return;
    setLoading(true); setError(null);
    try { await enterQueue(selectedTeamId); setInQueue(true); setWaitSeconds(0); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  };

  const handleLeave = async () => {
    setLoading(true);
    try { await leaveQueue(); setInQueue(false); }
    catch { } finally { setLoading(false); }
  };

  const handleChallenge = async () => {
    if (!selectedTeamId || !challengeHandle.trim()) return;
    setChallengeLoading(true); setChallengeError(null);
    try {
      await issueChallenge(challengeHandle.trim(), selectedTeamId);
      setChallengeSent(true);
    } catch (err) {
      setChallengeError(err instanceof Error ? err.message : 'Could not send challenge');
    } finally {
      setChallengeLoading(false);
    }
  };

  const closeChallengeModal = () => {
    setChallengeModal(false);
    setChallengeHandle('');
    setChallengeError(null);
    setChallengeSent(false);
  };

  const fmt = (s: number) => s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';

  if (inQueue) return (
    <SafeAreaView style={styles.container}>
      <View style={styles.queueScreen}>
        <Text style={styles.searchingTitle}>Finding Opponent...</Text>
        <Text style={styles.waitTime}>Wait: {fmt(waitSeconds)}</Text>
        <Text style={styles.sub}>Matching by Elo rating</Text>
        <Button title="Cancel" onPress={handleLeave} variant="ghost" loading={loading} />
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Play</Text>
        <Text style={styles.subtitle}>Choose a team and find a match</Text>
      </View>
      {error && <ErrorMessage message={error} />}
      <SectionHeader title="Select Team" />
      {teams.length === 0 ? (
        <EmptyState message="Create a team first in the Teams tab." />
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setSelectedTeamId(item.id)}>
              <Card style={[styles.teamCard, selectedTeamId === item.id && styles.selected]}>
                <View style={styles.row}>
                  <View>
                    <Text style={styles.teamName}>{item.name}</Text>
                    <Text style={styles.teamSub}>{item.unitIds.length} units</Text>
                  </View>
                  {selectedTeamId === item.id && <Text style={styles.check}>✓</Text>}
                </View>
              </Card>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <View style={styles.btnGroup}>
              <Button title="Find Match" onPress={handleEnter} loading={loading} disabled={!selectedTeamId} size="lg" />
              <Button title="Issue a Challenge" onPress={() => setChallengeModal(true)} disabled={!selectedTeamId} size="lg" />
            </View>
          }
        />
      )}

      {/* Challenge Modal */}
      <Modal visible={challengeModal} animationType="slide" transparent onRequestClose={closeChallengeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {challengeSent ? (
              <>
                <Text style={styles.modalTitle}>Challenge Sent!</Text>
                <Text style={styles.modalSub}>Your opponent will be notified. The match will appear on your home screen once they accept.</Text>
                <Button title="Done" onPress={closeChallengeModal} size="lg" />
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Issue a Challenge</Text>
                <Text style={styles.modalSub}>Enter your opponent's profile name exactly as they set it.</Text>
                {challengeError && <ErrorMessage message={challengeError} />}
                <TextInput
                  style={styles.handleInput}
                  value={challengeHandle}
                  onChangeText={setChallengeHandle}
                  placeholder="e.g. shadow_knight"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button
                  title="Send Challenge"
                  onPress={handleChallenge}
                  loading={challengeLoading}
                  disabled={challengeHandle.trim().length < 3}
                  size="lg"
                />
                <Button title="Cancel" onPress={closeChallengeModal} variant="ghost" size="lg" />
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: Spacing.lg, paddingBottom: 0 },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  list: { padding: Spacing.lg },
  teamCard: { marginBottom: Spacing.sm },
  selected: { borderColor: Colors.primary },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  teamSub: { color: Colors.textSecondary, fontSize: FontSize.sm },
  check: { color: Colors.primary, fontSize: FontSize.xl, fontWeight: '800' },
  btnGroup: { marginTop: Spacing.md, gap: Spacing.sm },
  queueScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  searchingTitle: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  waitTime: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '600' },
  sub: { color: Colors.textSecondary, fontSize: FontSize.sm },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.xl, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  modalTitle: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800' },
  modalSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.xs },
  handleInput: { backgroundColor: Colors.surface ?? '#1a1a2e', color: Colors.textPrimary, fontSize: FontSize.md, padding: Spacing.md, borderRadius: 10, borderWidth: 1, borderColor: Colors.border ?? '#333355' },
});
