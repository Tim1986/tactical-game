import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { getMatch, submitTurn, forfeitMatch, MatchDetail, UnitInstance, BoardPosition, TurnAction } from '../../src/api/client';
import { useAuthStore } from '../../src/store/authStore';
import { Button, Badge } from '../../src/components/ui';
import { Colors, Spacing, FontSize, Radius } from '../../src/components/theme';

const BOARD_SIZE = 8;
const TILE_SIZE = 42;
function cheby(a: BoardPosition, b: BoardPosition) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
type Phase = 'idle' | 'selected' | 'moving' | 'targeting';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [selUnit, setSelUnit] = useState<UnitInstance | null>(null);
  const [actions, setActions] = useState<TurnAction[]>([]);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [acted, setActed] = useState<Set<string>>(new Set());
  const [units, setUnits] = useState<UnitInstance[]>([]);
  const [abilitySlug, setAbilitySlug] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const myId = user?.id ?? '';
  const load = useCallback(async () => { try { const r = await getMatch(id); setMatch(r); setUnits(r.matchState.units); } catch { } finally { setLoading(false); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  const isMyTurn = match?.activePlayerId === myId && match?.status === 'active';
  const getAt = (x: number, y: number) => units.find((u) => u.isAlive && u.position.x === x && u.position.y === y) ?? null;
  const onTile = (x: number, y: number) => {
    if (!isMyTurn || submitting) return;
    const onTile = getAt(x, y);
    if (phase === 'moving' && selUnit) {
      const d = cheby(selUnit.position, { x, y });
      if (d > 0 && d <= (selUnit.movementRange ?? 3) && !onTile) {
        setUnits((p) => p.map((u) => u.instanceId === selUnit.instanceId ? { ...u, position: { x, y } } : u));
        setActions((p) => [...p, { type: 'MOVE', unitInstanceId: selUnit.instanceId, destination: { x, y } }]);
        setMoved((p) => new Set([...p, selUnit.instanceId]));
        setSelUnit((p) => p ? { ...p, position: { x, y } } : null);
        setPhase('selected'); setMsg('');
      }
      return;
    }
    if (phase === 'targeting' && selUnit && abilitySlug) {
      if (!onTile || onTile.ownerPlayerId === myId) { setMsg('Select an enemy'); return; }
      setActions((p) => [...p, { type: 'USE_ABILITY', unitInstanceId: selUnit.instanceId, abilitySlug, target: { x, y } }]);
      setActed((p) => new Set([...p, selUnit.instanceId]));
      setUnits((p) => p.map((u) => u.instanceId === selUnit.instanceId ? { ...u, hasActedThisTurn: true } : u));
      setPhase('selected'); setAbilitySlug(null); setMsg('Ability queued!');
      return;
    }
    if (onTile && onTile.ownerPlayerId === myId && onTile.isAlive) { setSelUnit(onTile); setPhase('selected'); setMsg(''); }
    else { setSelUnit(null); setPhase('idle'); }
  };
  const endTurn = async () => {
    if (!match) return; setSubmitting(true);
    try {
      const all: TurnAction[] = [...actions, { type: 'END_TURN' }];
      const r = await submitTurn(match.id, all);
      if (r.matchOver) { Alert.alert(r.winnerId === myId ? 'Victory!' : 'Defeat', r.winnerId === myId ? 'You won!' : 'You lost.', [{ text: 'OK', onPress: () => router.back() }]); }
      else { setMatch((p) => p ? { ...p, ...r.match, matchState: r.updatedState } : p); setUnits(r.updatedState.units); setActions([]); setMoved(new Set()); setActed(new Set()); setSelUnit(null); setPhase('idle'); setMsg('Turn submitted!'); }
    } catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Failed'); } finally { setSubmitting(false); }
  };
  const tileStyle = (x: number, y: number) => {
    if (phase === 'moving' && selUnit) { const d = cheby(selUnit.position, { x, y }); if (d > 0 && d <= (selUnit.movementRange ?? 3) && !getAt(x, y)) return styles.tileMove; }
    if (phase === 'targeting' && selUnit) { const u = getAt(x, y); if (u && u.ownerPlayerId !== myId) return styles.tileTgt; }
    if (selUnit?.position.x === x && selUnit?.position.y === y) return styles.tileSel;
    return (x + y) % 2 === 0 ? styles.tileL : styles.tileD;
  };
  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator color={Colors.primary} style={{ flex: 1 }} /></SafeAreaView>;
  if (!match) return <SafeAreaView style={styles.container}><Text style={{ color: Colors.danger, padding: 20 }}>Match not found</Text></SafeAreaView>;
  const selData = selUnit ? units.find((u) => u.instanceId === selUnit.instanceId) : null;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hdr}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>Back</Text></TouchableOpacity>
        <View style={{ alignItems: 'center', gap: 4 }}><Text style={styles.turnTxt}>Turn {match.turnNumber}</Text><Badge label={isMyTurn ? 'YOUR TURN' : 'WAITING'} color={isMyTurn ? Colors.success : Colors.textMuted} /></View>
        <TouchableOpacity onPress={() => Alert.alert('Forfeit?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: async () => { await forfeitMatch(id); router.back(); } }])}><Text style={styles.forf}>Forfeit</Text></TouchableOpacity>
      </View>
      {msg ? <View style={styles.msgBar}><Text style={styles.msgTxt}>{msg}</Text></View> : null}
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.sm }}>
          <View style={styles.board}>
            {Array.from({ length: BOARD_SIZE }).map((_, y) => (
              <View key={y} style={styles.row}>
                {Array.from({ length: BOARD_SIZE }).map((_, x) => {
                  const u = getAt(x, y);
                  return (
                    <TouchableOpacity key={x} style={[styles.tile, tileStyle(x, y)]} onPress={() => onTile(x, y)} activeOpacity={0.7}>
                      {u && <View style={[styles.uMark, { backgroundColor: u.ownerPlayerId === myId ? Colors.playerOne : Colors.playerTwo }]}>
                        <Text style={styles.uLbl}>{u.definitionSlug.charAt(0).toUpperCase()}</Text>
                        <View style={styles.hpBar}><View style={[styles.hpFill, { width: ((u.currentHealth / u.maxHealth) * 100) + '%' }]} /></View>
                      </View>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
      {isMyTurn && (
        <View style={styles.panel}>
          {selData && phase === 'selected' ? (
            <View>
              <Text style={styles.selName}>{selData.definitionSlug.replace(/_/g, ' ')}</Text>
              <Text style={styles.selHp}>HP {selData.currentHealth}/{selData.maxHealth}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.sm }}>
                {!moved.has(selData.instanceId) && <TouchableOpacity style={styles.actBtn} onPress={() => { setPhase('moving'); setMsg('Tap a tile'); }}><Text style={styles.actTxt}>Move</Text></TouchableOpacity>}
                {!acted.has(selData.instanceId) && (selData.abilities ?? []).map((slug) => (
                  <TouchableOpacity key={slug} style={[styles.actBtn, styles.ablBtn]} onPress={() => { setAbilitySlug(slug); setPhase('targeting'); setMsg('Tap enemy for ' + slug.replace(/_/g, ' ')); }}><Text style={styles.actTxt}>{slug.replace(/_/g, ' ')}</Text></TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : <Text style={styles.hint}>{phase === 'moving' ? 'Tap highlighted tile' : phase === 'targeting' ? 'Tap an enemy' : 'Tap your unit'}</Text>}
          <View style={styles.endRow}>
            {(phase === 'moving' || phase === 'targeting') && <Button title="Cancel" onPress={() => { setPhase('selected'); setMsg(''); }} variant="ghost" size="sm" />}
            <Button title="End Turn" onPress={endTurn} loading={submitting} size="sm" />
          </View>
        </View>
      )}
      {!isMyTurn && match.status === 'active' && <View style={styles.wait}><Text style={styles.waitTxt}>Waiting for opponent...</Text></View>}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  back: { color: Colors.primary, fontSize: FontSize.md },
  turnTxt: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  forf: { color: Colors.danger, fontSize: FontSize.sm },
  msgBar: { backgroundColor: Colors.primary + '22', padding: Spacing.sm, alignItems: 'center' },
  msgTxt: { color: Colors.primary, fontSize: FontSize.sm },
  board: { borderWidth: 1, borderColor: Colors.border },
  row: { flexDirection: 'row' },
  tile: { width: TILE_SIZE, height: TILE_SIZE, alignItems: 'center', justifyContent: 'center' },
  tileL: { backgroundColor: '#1a1a2e' }, tileD: { backgroundColor: '#16213e' },
  tileSel: { backgroundColor: Colors.primary + '44' }, tileMove: { backgroundColor: Colors.primaryDark + '88' }, tileTgt: { backgroundColor: Colors.danger + '44' },
  uMark: { width: TILE_SIZE - 4, height: TILE_SIZE - 4, borderRadius: 6, alignItems: 'center', justifyContent: 'center', padding: 2 },
  uLbl: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  hpBar: { width: '100%', height: 3, backgroundColor: Colors.danger + '44', borderRadius: 2, marginTop: 1 },
  hpFill: { height: '100%', backgroundColor: Colors.success, borderRadius: 2 },
  panel: { backgroundColor: Colors.bgCard, borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  selName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', textTransform: 'capitalize' },
  selHp: { color: Colors.textSecondary, fontSize: FontSize.sm },
  actBtn: { backgroundColor: Colors.primary + '33', borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, marginRight: Spacing.sm, borderWidth: 1, borderColor: Colors.primary },
  ablBtn: { backgroundColor: Colors.warning + '22', borderColor: Colors.warning },
  actTxt: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600', textTransform: 'capitalize' },
  hint: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
  endRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  wait: { backgroundColor: Colors.bgCard, borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, alignItems: 'center' },
  waitTxt: { color: Colors.textSecondary, fontSize: FontSize.sm },
});
