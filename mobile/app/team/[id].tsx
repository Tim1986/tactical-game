import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { getUnits, getTeams, createTeam, updateTeam, UnitDef } from '../../src/api/client';
import { Button, ErrorMessage } from '../../src/components/ui';
import { Colors, Spacing, FontSize, Radius } from '../../src/components/theme';

const TEAM_SIZE  = 4;
const BOARD_COLS = 8;
const BOARD_ROWS = 8;
const TILE_SIZE  = 40;

interface Pos { x: number; y: number }

// Default starting positions on the left half
const DEFAULT_POSITIONS: Pos[] = [
  { x: 0, y: 1 }, { x: 0, y: 3 }, { x: 0, y: 5 }, { x: 0, y: 7 },
];

type Step = 'pick' | 'place';

export default function TeamBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [step,        setStep]        = useState<Step>('pick');
  const [allUnits,    setAllUnits]    = useState<UnitDef[]>([]);
  const [teamName,    setTeamName]    = useState('');
  const [picked,      setPicked]      = useState<(UnitDef | null)[]>([null, null, null, null]);
  const [positions,   setPositions]   = useState<(Pos | null)[]>([null, null, null, null]);
  const [activeSlot,  setActiveSlot]  = useState<number>(0); // which unit is being placed
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    void getUnits().then(({ units }) => setAllUnits(units)).catch(() => {});
    if (!isNew) {
      void getTeams().then(({ teams }) => {
        const t = teams.find(t => t.id === id);
        if (!t) return;
        setTeamName(t.name);
        // Load existing unit definitions once allUnits is populated
        setLoading(true);
        getUnits().then(({ units }) => {
          const loaded = t.unitIds.map(uid => units.find(u => u.id === uid) ?? null);
          setPicked(loaded);
          // Use saved placement if it exists, otherwise use defaults
          const savedPlacement = t.placement && t.placement.length === 4
            ? t.placement
            : DEFAULT_POSITIONS;
          setPositions(savedPlacement.map((p, i) => loaded[i] ? p : null));
          setStep('place');
          setLoading(false);
        }).catch(() => setLoading(false));
      }).catch(() => {});
    }
  }, [id, isNew]);

  // ── Step 1: Pick units ──────────────────────────────────────────────────────
  const togglePick = (unit: UnitDef) => {
    // Always fill the first empty slot — duplicates allowed
    const emptyIdx = picked.findIndex(p => p === null);
    if (emptyIdx === -1) return; // all 4 slots full
    const next = [...picked];
    next[emptyIdx] = unit;
    setPicked(next);
  };

  const removeFromSlot = (slotIdx: number) => {
    const next = [...picked];
    next[slotIdx] = null;
    setPicked(next);
  };

  const pickedCount = picked.filter(Boolean).length;
  const canProceed  = pickedCount === TEAM_SIZE;

  const goToPlace = () => {
    if (!canProceed) return;
    // Set default positions for all picked units
    setPositions([...DEFAULT_POSITIONS]);
    setActiveSlot(0);
    setStep('place');
  };

  // ── Step 2: Place units ─────────────────────────────────────────────────────
  const handleTileTap = (x: number, y: number) => {
    if (x > 3) return; // left half only

    const clickedSlot = positions.findIndex(p => p && p.x === x && p.y === y);

    if (clickedSlot !== -1 && clickedSlot !== activeSlot) {
      // Tap another unit's tile — switch active slot to it
      setActiveSlot(clickedSlot);
      return;
    }

    if (clickedSlot === activeSlot) {
      // Tap active unit's own tile — deselect (remove placement)
      const next = [...positions];
      next[activeSlot] = null;
      setPositions(next);
      return;
    }

    // Empty tile — place active unit here
    const next = [...positions];
    next[activeSlot] = { x, y };
    setPositions(next);

    // Auto-advance to next unplaced unit
    const nextUnplaced = positions.findIndex((p, i) => i !== activeSlot && p === null);
    if (nextUnplaced !== -1) setActiveSlot(nextUnplaced);
  };

  const allPlaced = positions.every(p => p !== null);

  const save = async () => {
    if (!teamName.trim())  { setError('Enter a team name'); return; }
    if (pickedCount < TEAM_SIZE) { setError('Pick all 4 units'); return; }
    if (!allPlaced)        { setError('Place all 4 units on the board'); return; }

    setLoading(true); setError(null);
    try {
      const unitIds = picked.map(p => p!.id);
      const pos     = positions as Pos[];
      if (isNew) await createTeam(teamName.trim(), unitIds, pos);
      else       await updateTeam(id, teamName.trim(), unitIds, pos);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setLoading(false); }
  };

  const handleBack = () => {
    if (step === 'place') { setStep('pick'); return; }
    router.back();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack}>
          <Text style={s.back}>{step === 'place' ? '← Units' : '← Back'}</Text>
        </TouchableOpacity>
        <Text style={s.title}>{isNew ? 'New Team' : 'Edit Team'}</Text>
        {step === 'place'
          ? <Button title={isNew ? 'Create' : 'Save'} onPress={save} loading={loading} disabled={!allPlaced} size="sm" />
          : <Button title="Next →" onPress={goToPlace} disabled={!canProceed} size="sm" />
        }
      </View>

      {/* Team name */}
      <View style={s.nameRow}>
        <TextInput
          style={s.nameInput}
          value={teamName}
          onChangeText={setTeamName}
          placeholder="Team name..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      {error && <ErrorMessage message={error} />}

      {step === 'pick' ? (
        // ── STEP 1: Pick 4 units ──────────────────────────────────────────────
        <ScrollView contentContainerStyle={s.pickContent}>
          <Text style={s.stepHint}>
            Pick {TEAM_SIZE - pickedCount > 0 ? TEAM_SIZE - pickedCount + ' more' : 'done — tap Next'} · {pickedCount}/{TEAM_SIZE} selected
          </Text>

          {/* Selected unit pills */}
          <View style={s.pills}>
            {picked.map((u, i) => (
              <TouchableOpacity
                key={i}
                style={[s.pill, u ? s.pillFilled : s.pillEmpty]}
                onPress={() => { if (u) removeFromSlot(i); }}
              >
                <Text style={[s.pillTxt, !u && s.pillTxtEmpty]}>{u ? u.name : (i + 1) + ''}</Text>
                {u && <Text style={s.pillX}>×</Text>}
              </TouchableOpacity>
            ))}
          </View>

          {/* Unit roster */}
          <View style={s.roster}>
            {allUnits.map(unit => {
              const isFull = pickedCount >= TEAM_SIZE;
              return (
                <TouchableOpacity
                  key={unit.id}
                  style={[s.unitCard, picked.some(p => p?.id === unit.id) && s.unitCardSel, isFull && s.unitCardDim]}
                  onPress={() => { if (!isFull) togglePick(unit); }}
                  disabled={isFull}
                >
                  <View style={s.unitCardRow}>
                    <View>
                      <Text style={s.unitName}>{unit.name}</Text>
                      <Text style={s.unitStat}>HP {unit.maxHealth}  ·  MV {unit.movementRange}</Text>
                      <Text style={s.unitAbil}>{unit.abilities.map(a => a.replace(/_/g, ' ')).join(' · ')}</Text>
                    </View>
                    {pickedCount > 0 && (() => {
                      const count = picked.filter(p => p?.id === unit.id).length;
                      return count > 0 ? (
                        <View style={s.checkBadge}>
                          <Text style={s.checkTxt}>×{count}</Text>
                        </View>
                      ) : null;
                    })()}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        // ── STEP 2: Place units ───────────────────────────────────────────────
        <ScrollView contentContainerStyle={s.placeContent}>
          <Text style={s.stepHint}>
            Tap a tile on the left half to place your units. Tap a unit to select it.
          </Text>

          {/* Active unit indicator */}
          <View style={s.activeRow}>
            {picked.map((u, i) => {
              const placed = positions[i] !== null;
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.activeChip, i === activeSlot && s.activeChipOn, placed && s.activeChipPlaced]}
                  onPress={() => setActiveSlot(i)}
                >
                  <Text style={s.activeChipNum}>{i + 1}</Text>
                  <Text style={s.activeChipName} numberOfLines={1}>{u?.name ?? '—'}</Text>
                  {placed && <Text style={s.activeChipCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Board */}
          <View style={s.boardWrap}>
            <View style={s.board}>
              {Array.from({ length: BOARD_ROWS }).map((_, y) => (
                <View key={y} style={s.boardRow}>
                  {Array.from({ length: BOARD_COLS }).map((_, x) => {
                    const slotHere = positions.findIndex(p => p && p.x === x && p.y === y);
                    const isLeft   = x <= 3;
                    const isActive = slotHere === activeSlot;
                    const isOther  = slotHere !== -1 && slotHere !== activeSlot;
                    const isAvail  = isLeft && slotHere === -1;

                    let tileStyle = isLeft
                      ? (isAvail ? ((x + y) % 2 === 0 ? s.tileL : s.tileD) : s.tileL)
                      : s.tileDisabled;
                    if (isActive) tileStyle = s.tileActive;
                    else if (isOther) tileStyle = s.tileOther;

                    return (
                      <TouchableOpacity
                        key={x}
                        style={[s.tile, tileStyle]}
                        onPress={() => handleTileTap(x, y)}
                        disabled={!isLeft}
                        activeOpacity={0.7}
                      >
                        {slotHere !== -1 && (
                          <View style={[s.unitDot, { borderColor: slotHere === activeSlot ? '#fff' : Colors.primary }]}>
                            <Text style={s.unitDotTxt}>{picked[slotHere]?.name.charAt(0) ?? '?'}</Text>
                            <Text style={s.unitDotNum}>{slotHere + 1}</Text>
                          </View>
                        )}
                        {isAvail && slotHere === -1 && (
                          <View style={s.availDot} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
            <Text style={s.boardHint}>Your half ←  |  → Enemy half (locked)</Text>
          </View>

          {/* Active unit info */}
          {picked[activeSlot] && (
            <View style={s.activeInfo}>
              <Text style={s.activeInfoName}>Placing: <Text style={{ color: Colors.primary }}>{picked[activeSlot]!.name}</Text></Text>
              <Text style={s.activeInfoSub}>
                {positions[activeSlot]
                  ? 'Placed at (' + positions[activeSlot]!.x + ', ' + positions[activeSlot]!.y + ') — tap to move'
                  : 'Tap a tile on the left to place'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  back: { color: Colors.primary, fontSize: FontSize.md },
  title: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
  nameRow: { paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  nameInput: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, color: Colors.textPrimary, fontSize: FontSize.md, paddingHorizontal: Spacing.md, height: 44 },

  // Step 1 — pick
  pickContent: { padding: Spacing.md, gap: Spacing.md },
  stepHint: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
  pills: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center', flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, borderWidth: 1, gap: 4 },
  pillFilled: { backgroundColor: Colors.primary + '33', borderColor: Colors.primary },
  pillEmpty: { backgroundColor: Colors.bgCard, borderColor: Colors.border },
  pillTxt: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  pillTxtEmpty: { color: Colors.textMuted },
  pillX: { color: Colors.textMuted, fontSize: FontSize.sm },
  roster: { gap: Spacing.sm },
  unitCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  unitCardSel: { borderColor: Colors.primary, backgroundColor: Colors.primary + '11' },
  unitCardDim: { opacity: 0.4 },
  unitCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unitName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  unitStat: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  unitAbil: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 4 },
  checkBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkTxt: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },

  // Step 2 — place
  placeContent: { padding: Spacing.md, gap: Spacing.md, alignItems: 'center' },
  activeRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  activeChip: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard, alignItems: 'center', minWidth: 64 },
  activeChipOn: { borderColor: '#fff', borderWidth: 2, backgroundColor: Colors.primary + '22' },
  activeChipPlaced: { borderColor: Colors.success },
  activeChipNum: { color: Colors.primary, fontSize: 10, fontWeight: '800' },
  activeChipName: { color: Colors.textPrimary, fontSize: 10, fontWeight: '600' },
  activeChipCheck: { color: Colors.success, fontSize: 10 },
  boardWrap: { alignItems: 'center' },
  board: { borderWidth: 1, borderColor: Colors.border },
  boardRow: { flexDirection: 'row' },
  tile: { width: TILE_SIZE, height: TILE_SIZE, alignItems: 'center', justifyContent: 'center' },
  tileL: { backgroundColor: '#1a1a2e' },
  tileD: { backgroundColor: '#16213e' },
  tileActive: { backgroundColor: Colors.primary + '66', borderWidth: 2, borderColor: '#fff' },
  tileOther: { backgroundColor: Colors.primary + '33' },
  tileDisabled: { backgroundColor: '#080812' },
  unitDot: { width: TILE_SIZE - 6, height: TILE_SIZE - 6, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary + '44' },
  unitDotTxt: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  unitDotNum: { color: Colors.primary, fontSize: 8, fontWeight: '700' },
  availDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textMuted + '44' },
  boardHint: { color: Colors.textMuted, fontSize: 10, marginTop: 4 },
  activeInfo: { alignSelf: 'stretch', backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  activeInfoName: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  activeInfoSub: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
});
