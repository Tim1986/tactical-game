import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { getTeams, Team, deleteTeam } from '../../src/api/client';
import { Button, Card, EmptyState, SectionHeader } from '../../src/components/ui';
import { Colors, Spacing, FontSize } from '../../src/components/theme';

export default function TeamsScreen() {
  const [teams, setTeams] = useState<Team[]>([]);

  const load = useCallback(async () => {
    try { const result = await getTeams(); setTeams(result.teams); } catch { }
  }, []);

  // Reload every time this tab comes into focus
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const handleDelete = async (team: Team) => {
    const ok = typeof window !== 'undefined' ? window.confirm('Delete "' + team.name + '"?') : true;
    if (!ok) return;
    try { await deleteTeam(team.id); await load(); } catch { }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Teams</Text>
        <Button title="+ New Team" onPress={() => router.push('/team/new')} size="sm" />
      </View>
      <SectionHeader title={teams.length + ' team' + (teams.length !== 1 ? 's' : '')} />
      {teams.length === 0 ? (
        <EmptyState message="No teams yet. Create one to start playing!" />
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Card style={styles.teamCard}>
              <View style={styles.teamRow}>
                <View>
                  <Text style={styles.teamName}>{item.name}</Text>
                  <Text style={styles.teamUnits}>{item.unitIds.length} units</Text>
                </View>
                <View style={styles.teamActions}>
                  <TouchableOpacity onPress={() => router.push('/team/' + item.id)} style={styles.editBtn}>
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
                    <Text style={styles.deleteText}>X</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, paddingBottom: 0 },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  list: { padding: Spacing.lg },
  teamCard: { marginBottom: Spacing.sm },
  teamRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  teamUnits: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  teamActions: { flexDirection: 'row', gap: Spacing.sm },
  editBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, backgroundColor: Colors.primary + '33', borderRadius: 8 },
  editText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  deleteBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, backgroundColor: Colors.danger + '22', borderRadius: 8 },
  deleteText: { color: Colors.danger, fontSize: FontSize.sm, fontWeight: '600' },
});
