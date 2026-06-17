import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { getUnits, getTeams, createTeam, updateTeam, UnitDef } from '../../src/api/client';
import { Button, ErrorMessage } from '../../src/components/ui';
import { Colors, Spacing, FontSize, Radius } from '../../src/components/theme';

const TEAM_SIZE = 4;
const BOARD_SIZE = 8;
const TILE_SIZE = 36;

interface Pos { x: number; y: number }
const DEFAULT_PLACEMENT: Pos[] = [{ x: 1, y: 1 }, { x: 1, y: 3 }, { x: 1, y: 5 }, { x: 1, y: 7 }];

export default function TeamBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [units, setUnits] = useState<UnitDef[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [teamName, setTeamName] = useState('');
  const [placement, setPlacement] = useState<(Pos | null)[]>([null, null, null, null]);
  const [activeSlot, setActiveSlot] = useState<number>(0); // which slot we're editing
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getUnits().then(({ units: u }) => setUnits(u)).catch(() => {});
    if (!isNew) {
      void getTeams().then(({ teams }) => {
        const t = teams.find((t) => t.id === id);
        if (t) {
          setTeamName(t.name);
          setSelectedIds([...t.unitIds]);
          if (t.placement && t.placement.length === 4) {
            setPlacement([...t.placement]);
          } else {
            setPlacement([...DEFAULT_PLACEMENT]);
          }
          setActiveSlot(-1); // no slot active when editing existing team
        }
      }).catch(() => {});
    }
  }, [id, isNew]);

  const selectUnitForSlot = (unitId: string) => {
    if (activeSlot < 0 || activeSlot >= TEAM_SIZE) return;
    const next = [...selectedIds];
    next[activeSlot] = unitId;
    setSelectedIds(next);
    // Auto-advance to next empty slot
    const nextEmpty = next.findIndex((s, i) => i > activeSlot && !s);
    if (nextEmpty !== -1) setActiveSlot(nextEmpty);
    else setActiveSlot(-1);
  };

  const handlePlacementTile = (x: number, y: number) => {
    if (x > 3) return; // left half only
    if (activeSlot < 0 || activeSlot >= TEAM_SIZE) return;
    if (!selectedIds[activeSlot]) return; // must have unit selected for this slot

    // Remove any existing placement at this tile
    const tileSlot = placement.findIndex(p => p && p.x === x && p.y === y);
    if (tileSlot === activeSlot) {
      // Clicking own placed tile — remove it
      const next = [...placement]; next[activeSlot] = null; setPlacement(next); return;
    }
    if (tileSlot !== -1) {
      // Tile taken by another slot — swap
      const next = [...placement];
      const tmp = next[activeSlot];
      next[activeSlot] = next[tileSlot];
      next[tileSlot] = tmp;
      setPlacement(next); return;
    }
    // Place on empty tile
    const next = [...placement]; next[activeSlot] = { x, y }; setPlacement(next);
  };

  const allPlaced = placement.every(p => p !== null);
  const allSelected = selectedIds.length === TEAM_SIZE && selectedIds.every(Boolean);

  const save = async () => {
    if (!teamName.trim()) { setError('Enter a team name'); return; }
    if (!allSelected) { setError('Select all 4 units'); return; }
    if (!allPlaced) { setError('Place all 4 units on the board'); return; }
    setLoading(true); setError(null);
    try {
      const p = placement as Pos[];
      if (isNew) await createTeam(teamName.trim(), selectedIds, p);
      else await updateTeam(id, teamName.trim(), selectedIds, p);
      router.back();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>Back</Text></TouchableOpacity>
        <Text style={styles.title}>{isNew ? 'New Team' : 'Edit Team'}</Text>
        <Button title={isNew ? 'Create' : 'Save'} onPress={save} loading={loading} disabled={!allSelected || !allPlaced || !teamName.trim()} size="sm" />
      </View>

      <View style={styles.nameRow}>
        <TextInput style={styles.nameInput} value={teamName} onChangeText={setTeamName} placeholder="Team name..." placeholderTextColor={Colors.textMuted} />
      </View>

      {error && <ErrorMessage message={error} />}

      <Text style={styles.sectionLabel}>SLOTS — tap a slot to edit it</Text>

      {/* Slot selector */}
      <View style={styles.slots}>
        {Array.from({ length: TEAM_SIZE }).map((_, i) => {
          const unit = units.find(u => u.id === selectedIds[i]);
          const pos = placement[i];
          const isActive = activeSlot === i;
          return (
            <TouchableOpacity key={i} style={[styles.slot, isActive && styles.slotActive, unit && styles.slotFilled]} onPress={() => setActiveSlot(i)}>
              <Text style={styles.slotNum}>{i + 1}</Text>
              <Text style={styles.slotUnit} numberOfLines={1}>{unit ? unit.name : '—'}</Text>
              <Text style={styles.slotPos}>{pos ? '(' + pos.x + ',' + pos.y + ')' : 'unplaced'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeSlot >= 0 && (
        <Text style={styles.instruction}>
          {!selectedIds[activeSlot]
            ? 'Pick a unit for slot ' + (activeSlot + 1) + ':'
            : !placement[activeSlot]
            ? 'Tap left half of board to place ' + (units.find(u => u.id === selectedIds[activeSlot])?.name ?? '') + ':'
            : 'Tap board to reposition, or pick a different unit:'}
        </Text>
      )}

      <ScrollView style={styles.content}>
        {/* Board */}
        <View style={styles.boardWrap}>
          <View style={styles.board}>
            {Array.from({ length: BOARD_SIZE }).map((_, y) => (
              <View key={y} style={styles.boardRow}>
                {Array.from({ length: BOARD_SIZE }).map((_, x) => {
                  const unitIdx = placement.findIndex(p => p && p.x === x && p.y === y);
                  const isLeft = x <= 3;
                  const isThisSlot = unitIdx === activeSlot;
                  const isOtherSlot = unitIdx !== -1 && unitIdx !== activeSlot;
                  const isAvail = isLeft && unitIdx === -1 && activeSlot >= 0 && !!selectedIds[activeSlot];
                  const slotUnit = unitIdx !== -1 ? units.find(u => u.id === selectedIds[unitIdx]) : null;
                  return (
                    <TouchableOpacity
                      key={x}
                      style={[
                        styles.tile,
                        isThisSlot ? styles.tileActive :
                        isOtherSlot ? styles.tileFilled :
                        isAvail ? styles.tileAvail :
                        isLeft ? ((x + y) % 2 === 0 ? styles.tileL : styles.tileD) :
                        styles.tileDisabled
                      ]}
                      onPress={() => handlePlacementTile(x, y)}
                      disabled={!isLeft || activeSlot < 0}
                    >
                      {unitIdx !== -1 && (
                        <View style={[styles.unitMark, { borderColor: unitIdx === activeSlot ? '#fff' : Colors.primary }]}>
                          <Text style={styles.unitLbl}>{slotUnit?.name.charAt(0) ?? '?'}</Text>
                          <Text style={styles.unitNum}>{unitIdx + 1}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={styles.boardHint}>← Place here  |  Right side disabled →</Text>
        </View>

        {/* Unit roster */}
        {activeSlot >= 0 && (
          <>
            <Text style={styles.sectionLabel}>CHOOSE UNIT FOR SLOT {activeSlot + 1}:</Text>
            <View style={styles.roster}>
              {units.map(unit => {
                const isSelected = selectedIds[activeSlot] === unit.id;
                const usedInOtherSlot = selectedIds.some((sid, i) => i !== activeSlot && sid === unit.id);
                return (
                  <TouchableOpacity
                    key={unit.id}
                    style={[styles.unitCard, isSelected && styles.unitCardSel]}
                    onPress={() => selectUnitForSlot(unit.id)}
                  >
                    <Text style={styles.unitName}>{unit.name}</Text>
                    <Text style={styles.unitStat}>HP {unit.maxHealth}  MV {unit.movementRange}</Text>
                    {isSelected && <View style={styles.checkBadge}><Text style={styles.checkText}>✓</Text></View>}
                    {usedInOtherSlot && !isSelected && <View style={styles.dupBadge}><Text style={styles.dupText}>+</Text></View>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  back: { color: Colors.primary, fontSize: FontSize.md },
  title: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
  nameRow: { paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  nameInput: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, color: Colors.textPrimary, fontSize: FontSize.md, paddingHorizontal: Spacing.md, height: 44 },
  sectionLabel: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1, paddingHorizontal: Spacing.md, marginBottom: Spacing.xs },
  slots: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.xs, marginBottom: Spacing.sm },
  slot: { flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.xs, alignItems: 'center' },
  slotActive: { borderColor: '#ffffff', borderWidth: 2 },
  slotFilled: { borderColor: Colors.primary },
  slotNum: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800' },
  slotUnit: { color: Colors.textPrimary, fontSize: 9, fontWeight: '600', textAlign: 'center' },
  slotPos: { color: Colors.textMuted, fontSize: 8 },
  instruction: { color: Colors.textSecondary, fontSize: FontSize.xs, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  content: { flex: 1 },
  boardWrap: { alignItems: 'center', marginBottom: Spacing.sm },
  board: { borderWidth: 1, borderColor: Colors.border },
  boardRow: { flexDirection: 'row' },
  tile: { width: TILE_SIZE, height: TILE_SIZE, alignItems: 'center', justifyContent: 'center' },
  tileL: { backgroundColor: '#1a1a2e' },
  tileD: { backgroundColor: '#16213e' },
  tileActive: { backgroundColor: Colors.primary + '55', borderWidth: 2, borderColor: '#fff' },
  tileFilled: { backgroundColor: Colors.primary + '33' },
  tileAvail: { backgroundColor: Colors.primaryDark + '88' },
  tileDisabled: { backgroundColor: '#0a0a14' },
  unitMark: { width: TILE_SIZE - 6, height: TILE_SIZE - 6, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary + '44' },
  unitLbl: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  unitNum: { color: Colors.primary, fontSize: 8, fontWeight: '700' },
  boardHint: { color: Colors.textMuted, fontSize: 9, marginTop: 4 },
  roster: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.sm, gap: Spacing.xs },
  unitCard: { width: '48%', backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  unitCardSel: { borderColor: Colors.primary, backgroundColor: Colors.primary + '11' },
  unitName: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  unitStat: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  checkBadge: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: Colors.textPrimary, fontSize: 10, fontWeight: '800' },
  dupBadge: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  dupText: { color: Colors.textMuted, fontSize: 10 },
});
