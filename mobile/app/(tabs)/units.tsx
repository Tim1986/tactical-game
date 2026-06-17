import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUnits, UnitDef, AbilityDef } from '../../src/api/client';
import { Card, Badge, SectionHeader } from '../../src/components/ui';
import { Colors, Spacing, FontSize } from '../../src/components/theme';

export default function UnitsScreen() {
  const [units, setUnits] = useState<UnitDef[]>([]);
  const [abilities, setAbilities] = useState<Map<string, AbilityDef>>(new Map());
  const [selected, setSelected] = useState<UnitDef | null>(null);
  useEffect(() => { getUnits().then(({ units: u, abilities: a }) => { setUnits(u); setAbilities(new Map(a.map((ab) => [ab.slug, ab]))); }).catch(() => {}); }, []);
  if (selected) return <UnitDetail unit={selected} abilities={abilities} onBack={() => setSelected(null)} />;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Unit Roster</Text><Text style={styles.subtitle}>{units.length} units available</Text></View>
      <FlatList data={units} keyExtractor={(u) => u.id} contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setSelected(item)}>
            <Card style={styles.unitCard}>
              <View style={styles.unitRow}>
                <View style={styles.unitInfo}><Text style={styles.unitName}>{item.name}</Text><View style={styles.statRow}><StatPill label="HP" value={item.maxHealth} color={Colors.success} /><StatPill label="MOV" value={item.movementRange} color={Colors.info} /></View></View>
                <Text style={styles.chevron}>{'>'}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
function UnitDetail({ unit, abilities, onBack }: { unit: UnitDef; abilities: Map<string, AbilityDef>; onBack: () => void }) {
  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backText}>Back</Text></TouchableOpacity>
      <View style={styles.detailHeader}><Text style={styles.detailName}>{unit.name}</Text><View style={styles.statRowLarge}><StatPill label="HP" value={unit.maxHealth} color={Colors.success} /><StatPill label="MOVE" value={unit.movementRange} color={Colors.info} /><StatPill label="LV" value={unit.unlockLevel} color={Colors.warning} /></View></View>
      <SectionHeader title="Abilities" />
      {unit.abilities.map((slug) => { const ab = abilities.get(slug); if (!ab) return null; return (
        <Card key={slug} style={styles.abilityCard}>
          <View style={styles.abilityHeader}><Text style={styles.abilityName}>{ab.name}</Text><View style={styles.abilityBadges}><Badge label={'Range ' + ab.range} color={Colors.info} />{ab.cooldownTurns > 0 && <Badge label={'CD ' + ab.cooldownTurns} color={Colors.warning} />}</View></View>
          <Text style={styles.abilityDesc}>{ab.description}</Text>
        </Card>
      ); })}
      <SectionHeader title="Passives" />
      {unit.passives.map((slug) => <Card key={slug} style={styles.abilityCard}><Text style={styles.abilityName}>{slug.replace(/_/g, ' ')}</Text></Card>)}
    </SafeAreaView>
  );
}
function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={[styles.statPill, { backgroundColor: color + '22' }]}><Text style={[styles.statLabel, { color }]}>{label}</Text><Text style={[styles.statValue, { color }]}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: Spacing.lg, paddingBottom: 0 },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  list: { padding: Spacing.lg },
  unitCard: { marginBottom: Spacing.sm },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  unitInfo: { flex: 1 },
  unitName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  statRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs },
  chevron: { color: Colors.textMuted, fontSize: 24 },
  backBtn: { padding: Spacing.lg, paddingBottom: 0 },
  backText: { color: Colors.primary, fontSize: FontSize.md },
  detailHeader: { padding: Spacing.lg, alignItems: 'center' },
  detailName: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  statRowLarge: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  statPill: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: 8, alignItems: 'center' },
  statLabel: { fontSize: FontSize.xs, fontWeight: '600' },
  statValue: { fontSize: FontSize.lg, fontWeight: '800' },
  abilityCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  abilityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  abilityName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  abilityBadges: { flexDirection: 'row', gap: Spacing.xs },
  abilityDesc: { color: Colors.textSecondary, fontSize: FontSize.sm },
});
