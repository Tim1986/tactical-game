import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Platform, Image, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { getMatch, submitTurn, forfeitMatch, MatchDetail, UnitInstance, BoardPosition, TurnAction, AbilityDef, getUnits } from '../../src/api/client';
import { useAuthStore } from '../../src/store/authStore';
import { Button, Badge } from '../../src/components/ui';
import { Colors, Spacing, FontSize, Radius } from '../../src/components/theme';

// ─── Board & Sprite Constants ─────────────────────────────────────────────────
const BS = 8;
const TILE = 60;
const SPRITE_FRAME_W = 222;
const SPRITE_FRAME_H = 271;
const SPRITE_FEET_Y  = 245;
const UNIT_CELL = TILE;

type FacingDir = 's' | 'n' | 'e' | 'w';
type AnimName  = 'idle' | 'walk' | 'attack' | 'hit' | 'dodge';

// ─── Distance helpers (must match backend) ───────────────────────────────────
function mdist(a: BoardPosition, b: BoardPosition) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function cdist(a: BoardPosition, b: BoardPosition) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

// ─── Sprite Map ───────────────────────────────────────────────────────────────
const SPRITE_MAP: Record<string, Record<string, Record<FacingDir, any>>> = {
  barbarian: {
    p1: { s: require('../../assets/images/barbarian_blue_s.png'), n: require('../../assets/images/barbarian_blue_n.png'), e: require('../../assets/images/barbarian_blue_e.png'), w: require('../../assets/images/barbarian_blue_w.png') },
    p2: { s: require('../../assets/images/barbarian_red_s.png'),  n: require('../../assets/images/barbarian_red_n.png'),  e: require('../../assets/images/barbarian_red_e.png'),  w: require('../../assets/images/barbarian_red_w.png')  },
  },
  cleric: {
    p1: { s: require('../../assets/images/cleric_blue_s.png'), n: require('../../assets/images/cleric_blue_n.png'), e: require('../../assets/images/cleric_blue_e.png'), w: require('../../assets/images/cleric_blue_w.png') },
    p2: { s: require('../../assets/images/cleric_red_s.png'),  n: require('../../assets/images/cleric_red_n.png'),  e: require('../../assets/images/cleric_red_e.png'),  w: require('../../assets/images/cleric_red_w.png')  },
  },
  fighter: {
    p1: { s: require('../../assets/images/fighter_blue_s.png'), n: require('../../assets/images/fighter_blue_n.png'), e: require('../../assets/images/fighter_blue_e.png'), w: require('../../assets/images/fighter_blue_w.png') },
    p2: { s: require('../../assets/images/fighter_red_s.png'),  n: require('../../assets/images/fighter_red_n.png'),  e: require('../../assets/images/fighter_red_e.png'),  w: require('../../assets/images/fighter_red_w.png')  },
  },
  rogue: {
    p1: { s: require('../../assets/images/rogue_blue_s.png'), n: require('../../assets/images/rogue_blue_n.png'), e: require('../../assets/images/rogue_blue_e.png'), w: require('../../assets/images/rogue_blue_w.png') },
    p2: { s: require('../../assets/images/rogue_red_s.png'),  n: require('../../assets/images/rogue_red_n.png'),  e: require('../../assets/images/rogue_red_e.png'),  w: require('../../assets/images/rogue_red_w.png')  },
  },
  ranger: {
    p1: { s: require('../../assets/images/ranger_blue_s.png'), n: require('../../assets/images/ranger_blue_n.png'), e: require('../../assets/images/ranger_blue_e.png'), w: require('../../assets/images/ranger_blue_w.png') },
    p2: { s: require('../../assets/images/ranger_red_s.png'),  n: require('../../assets/images/ranger_red_n.png'),  e: require('../../assets/images/ranger_red_e.png'),  w: require('../../assets/images/ranger_red_w.png')  },
  },
  sorcerer: {
    p1: { s: require('../../assets/images/sorcerer_blue_s.png'), n: require('../../assets/images/sorcerer_blue_n.png'), e: require('../../assets/images/sorcerer_blue_e.png'), w: require('../../assets/images/sorcerer_blue_w.png') },
    p2: { s: require('../../assets/images/sorcerer_red_s.png'),  n: require('../../assets/images/sorcerer_red_n.png'),  e: require('../../assets/images/sorcerer_red_e.png'),  w: require('../../assets/images/sorcerer_red_w.png')  },
  },
  warlock: {
    p1: { s: require('../../assets/images/warlock_blue_s.png'), n: require('../../assets/images/warlock_blue_n.png'), e: require('../../assets/images/warlock_blue_e.png'), w: require('../../assets/images/warlock_blue_w.png') },
    p2: { s: require('../../assets/images/warlock_red_s.png'),  n: require('../../assets/images/warlock_red_n.png'),  e: require('../../assets/images/warlock_red_e.png'),  w: require('../../assets/images/warlock_red_w.png')  },
  },
  wizard: {
    p1: { s: require('../../assets/images/wizard_blue_s.png'), n: require('../../assets/images/wizard_blue_n.png'), e: require('../../assets/images/wizard_blue_e.png'), w: require('../../assets/images/wizard_blue_w.png') },
    p2: { s: require('../../assets/images/wizard_red_s.png'),  n: require('../../assets/images/wizard_red_n.png'),  e: require('../../assets/images/wizard_red_e.png'),  w: require('../../assets/images/wizard_red_w.png')  },
  },
};
const FALLBACK_SPRITE = SPRITE_MAP.cleric;

// ─── Animation System ─────────────────────────────────────────────────────────
const STEP_DURATION_MS = 560;
const WALK_FPS = 2000 / STEP_DURATION_MS;
const ANIM_FRAMES: Record<AnimName, number[]> = {
  idle: [0], walk: [1, 3], attack: [4, 5, 0], hit: [6, 0], dodge: [7, 0],
};
const ANIM_FPS: Record<AnimName, number> = {
  idle: 1, walk: WALK_FPS, attack: 2, hit: 1.5, dodge: 1.5,
};

const _unitFacing    = new Map<string, FacingDir>();
const _animCallbacks = new Map<string, (anim: AnimName) => void>();
const _unitAnimPos   = new Map<string, Animated.ValueXY>();

function getFacing(id: string): FacingDir   { return _unitFacing.get(id) ?? 's'; }
function setFacing(id: string, d: FacingDir) { _unitFacing.set(id, d); }
function triggerUnitAnim(id: string, anim: AnimName) { _animCallbacks.get(id)?.(anim); }
function triggerUnitAnimFacing(id: string, anim: AnimName, dir: FacingDir) { setFacing(id, dir); triggerUnitAnim(id, anim); }

function dirToward(a: BoardPosition, b: BoardPosition): FacingDir {
  const dx = b.x - a.x; const dy = b.y - a.y;
  if (dx > 0) return 'e'; if (dx < 0) return 'w';
  if (dy > 0) return 's'; return 'n';
}

function tileScreenPos(x: number, y: number) {
  return { sx: x * TILE, sy: y * TILE };
}

function getUnitAnimPos(id: string, sx: number, sy: number): Animated.ValueXY {
  if (!_unitAnimPos.has(id)) _unitAnimPos.set(id, new Animated.ValueXY({ x: sx, y: sy }));
  return _unitAnimPos.get(id)!;
}

function snapUnitAnimPos(id: string, sx: number, sy: number) {
  _unitAnimPos.get(id)?.setValue({ x: sx, y: sy });
}

function animateUnitAlongPath(id: string, path: BoardPosition[], stepIdx: number, onDone?: () => void) {
  if (path.length === 0) { onDone?.(); return; }
  const [next, ...rest] = path;
  const { sx, sy } = tileScreenPos(next.x, next.y);
  triggerUnitAnim(id, 'walk');
  Animated.timing(_unitAnimPos.get(id)!, {
    toValue: { x: sx, y: sy }, duration: STEP_DURATION_MS, useNativeDriver: false,
  }).start(({ finished }) => {
    if (!finished) return;
    if (rest.length > 0) animateUnitAlongPath(id, rest, stepIdx + 1, onDone);
    else { triggerUnitAnim(id, 'idle'); onDone?.(); }
  });
}

// ─── UnitFigure Component ─────────────────────────────────────────────────────
function UnitFigure({ unitId, slug, team, opacity = 1 }: { unitId: string; slug: string; team: string; opacity?: number }) {
  const scale  = UNIT_CELL / SPRITE_FRAME_W;
  const frameH = SPRITE_FRAME_H * scale;
  const feetY  = SPRITE_FEET_Y  * scale;

  const [animState, setAnimState] = useState({ anim: 'idle' as AnimName, frame: 0, lockedUntil: 0 });
  const [facing, setFacingState]  = useState<FacingDir>(() => getFacing(unitId));
  const animRef = useRef(animState);
  animRef.current = animState;

  useEffect(() => {
    _animCallbacks.set(unitId, (anim: AnimName) => {
      const now = Date.now();
      if (animRef.current.lockedUntil > now && animRef.current.anim !== 'walk') return;
      setFacingState(getFacing(unitId));
      const frames = ANIM_FRAMES[anim];
      const duration = anim === 'idle' ? 0 : (frames.length / ANIM_FPS[anim]) * 1000;
      setAnimState({ anim, frame: 0, lockedUntil: anim === 'idle' ? 0 : now + duration });
    });
    return () => { _animCallbacks.delete(unitId); };
  }, [unitId]);

  useEffect(() => {
    const { anim, frame, lockedUntil } = animState;
    const t = setTimeout(() => {
      const seq = ANIM_FRAMES[anim];
      const next = frame + 1;
      if (next >= seq.length) {
        if (anim === 'idle') setAnimState(s => ({ ...s, frame: 0 }));
        else if (anim === 'walk') setAnimState({ anim: 'idle', frame: 0, lockedUntil: 0 });
        else if (lockedUntil > Date.now()) setAnimState(s => ({ ...s, frame: 0 }));
        else { setFacingState(getFacing(unitId)); setAnimState({ anim: 'idle', frame: 0, lockedUntil: 0 }); }
      } else { setAnimState(s => ({ ...s, frame: next })); }
    }, 1000 / ANIM_FPS[animState.anim]);
    return () => clearTimeout(t);
  }, [animState, unitId]);

  const teamSprites = SPRITE_MAP[slug] ?? FALLBACK_SPRITE;
  const source      = (teamSprites[team] ?? teamSprites.p1)[facing];
  const flatIdx     = ANIM_FRAMES[animState.anim][Math.min(animState.frame, ANIM_FRAMES[animState.anim].length - 1)];

  return (
    <View style={{ width: UNIT_CELL, height: feetY, overflow: 'hidden', opacity }}>
      <Image source={source} style={{ width: UNIT_CELL * 8, height: frameH, position: 'absolute', top: 0, left: -(flatIdx * UNIT_CELL) }} resizeMode="contain" />
    </View>
  );
}

// ─── Highlight logic ──────────────────────────────────────────────────────────
type TileHighlight = 'none' | 'move' | 'range' | 'tgt' | 'sel';

function getTileHighlight(
  x: number, y: number,
  phase: Phase, selUnit: UnitInstance | null,
  units: UnitInstance[], myId: string,
  pendingAbility: AbilityDef | null,
): TileHighlight {
  if (!selUnit) return 'none';
  const pos = { x, y };

  if (selUnit.position.x === x && selUnit.position.y === y) return 'sel';

  if (phase === 'moving') {
    const d = mdist(selUnit.position, pos);
    const range = selUnit.movementRange ?? 3;
    const occupied = units.some(u => u.isAlive && u.position.x === x && u.position.y === y);
    if (d > 0 && d <= range && !occupied) return 'move';
  }

  if (phase === 'targeting' && pendingAbility) {
    const d = cdist(selUnit.position, pos);
    if (d > 0 && d <= pendingAbility.range) {
      const target = units.find(u => u.isAlive && u.position.x === x && u.position.y === y);
      if (target && target.ownerPlayerId !== myId) return 'tgt';
      return 'range';
    }
  }

  return 'none';
}

// ─── Tile Colors ──────────────────────────────────────────────────────────────
const TILE_COLORS: Record<TileHighlight, string | null> = {
  none: null, sel: Colors.primary + '55',
  move: '#1a4aaa88', range: '#7a1a1a88', tgt: '#cc440088',
};

// ─── BFS path builder (matching backend movement rules) ───────────────────────
function buildPath(from: BoardPosition, to: BoardPosition, units: UnitInstance[], movingId: string): BoardPosition[] {
  const mover = units.find(u => u.instanceId === movingId);
  const blocked = new Set(units.filter(u => u.isAlive && u.instanceId !== movingId && u.ownerPlayerId !== mover?.ownerPlayerId).map(u => `${u.position.x},${u.position.y}`));
  const key = (p: BoardPosition) => `${p.x},${p.y}`;
  const visited = new Set([key(from)]);
  const parent = new Map<string, BoardPosition>();
  const queue: BoardPosition[] = [from];
  const DIRS = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) {
      const path: BoardPosition[] = [];
      let node = to;
      while (key(node) !== key(from)) { path.unshift(node); node = parent.get(key(node))!; }
      return path;
    }
    for (const d of DIRS) {
      const next = { x: cur.x + d.x, y: cur.y + d.y };
      const k = key(next);
      if (next.x < 0 || next.x >= BS || next.y < 0 || next.y >= BS) continue;
      if (visited.has(k)) continue;
      if (blocked.has(k) && !(next.x === to.x && next.y === to.y)) continue;
      visited.add(k); parent.set(k, cur); queue.push(next);
    }
  }
  return [to];
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'selected' | 'moving' | 'targeting';

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const myId = user?.id ?? '';

  const [match,       setMatch]       = useState<MatchDetail | null>(null);
  const [units,       setUnits]       = useState<UnitInstance[]>([]);
  const [abilityDefs, setAbilityDefs] = useState<Map<string, AbilityDef>>(new Map());
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [phase,       setPhase]       = useState<Phase>('idle');
  const [selUnit,     setSelUnit]     = useState<UnitInstance | null>(null);
  const [pendingAbility, setPendingAbility] = useState<AbilityDef | null>(null);
  const [actions,     setActions]     = useState<TurnAction[]>([]);
  const [moved,       setMoved]       = useState<Set<string>>(new Set());
  const [acted,       setActed]       = useState<Set<string>>(new Set());
  const [msg,         setMsg]         = useState('');

  // Which player is p1 (blue) vs p2 (red)
  const [p1Id, setP1Id] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, unitData] = await Promise.all([getMatch(id), getUnits()]);
      setMatch(r);
      setUnits(r.matchState.units);
      setP1Id(r.playerOneId);

      // Build ability map
      const amap = new Map<string, AbilityDef>();
      for (const a of unitData.abilities) amap.set(a.slug, a);
      setAbilityDefs(amap);

      // Init facing: p1 faces east, p2 faces west
      for (const u of r.matchState.units) {
        const team = u.ownerPlayerId === r.playerOneId ? 'p1' : 'p2';
        setFacing(u.instanceId, team === 'p1' ? 'e' : 'w');
        const { sx, sy } = tileScreenPos(u.position.x, u.position.y);
        const av = _unitAnimPos.get(u.instanceId);
        if (av) av.setValue({ x: sx, y: sy });
        else _unitAnimPos.set(u.instanceId, new Animated.ValueXY({ x: sx, y: sy }));
      }
    } catch { }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const isMyTurn = match?.activePlayerId === myId && match?.status === 'active';

  const getAt = useCallback((x: number, y: number) =>
    units.find(u => u.isAlive && u.position.x === x && u.position.y === y) ?? null,
  [units]);

  const onTile = (x: number, y: number) => {
    if (!isMyTurn || submitting) return;
    const tileUnit = getAt(x, y);

    // Moving
    if (phase === 'moving' && selUnit) {
      const d = mdist(selUnit.position, { x, y });
      const range = selUnit.movementRange ?? 3;
      if (d > 0 && d <= range && !tileUnit) {
        const path = buildPath(selUnit.position, { x, y }, units, selUnit.instanceId);
        const newPos = { x, y };
        // Animate
        const dir = dirToward(selUnit.position, newPos);
        setFacing(selUnit.instanceId, dir);
        animateUnitAlongPath(selUnit.instanceId, path, 0, () => {
          triggerUnitAnimFacing(selUnit.instanceId, 'idle', dirToward(selUnit.position, newPos));
        });
        setUnits(p => p.map(u => u.instanceId === selUnit.instanceId ? { ...u, position: newPos } : u));
        setActions(p => [...p, { type: 'MOVE', unitInstanceId: selUnit.instanceId, destination: newPos }]);
        setMoved(p => new Set([...p, selUnit.instanceId]));
        setSelUnit(p => p ? { ...p, position: newPos } : null);
        setPhase('selected'); setMsg('');
      }
      return;
    }

    // Targeting
    if (phase === 'targeting' && selUnit && pendingAbility) {
      if (!tileUnit || tileUnit.ownerPlayerId === myId) { setMsg('Select an enemy target'); return; }
      const d = cdist(selUnit.position, { x, y });
      if (d > pendingAbility.range) { setMsg('Out of range'); return; }

      // Animate attacker
      const atkDir = dirToward(selUnit.position, tileUnit.position);
      triggerUnitAnimFacing(selUnit.instanceId, 'attack', atkDir);
      // Animate defender (hit)
      setTimeout(() => {
        triggerUnitAnimFacing(tileUnit.instanceId, 'hit', dirToward(tileUnit.position, selUnit.position));
      }, 400);

      setActions(p => [...p, { type: 'USE_ABILITY', unitInstanceId: selUnit.instanceId, abilitySlug: pendingAbility.slug, target: { x, y } }]);
      setActed(p => new Set([...p, selUnit.instanceId]));
      setUnits(p => p.map(u => u.instanceId === selUnit.instanceId ? { ...u, hasActedThisTurn: true } : u));
      setPhase('selected'); setPendingAbility(null); setMsg('Ability queued!');
      return;
    }

    // Select own unit
    if (tileUnit && tileUnit.ownerPlayerId === myId && tileUnit.isAlive) {
      setSelUnit(tileUnit); setPhase('selected'); setMsg(''); setPendingAbility(null);
      return;
    }
    setSelUnit(null); setPhase('idle'); setPendingAbility(null);
  };

  const endTurn = async () => {
    if (!match) return;
    setSubmitting(true);
    try {
      const all: TurnAction[] = [...actions, { type: 'END_TURN' }];
      const r = await submitTurn(match.id, all);

      if (r.matchOver) {
        const won = r.winnerId === myId;
        const doAlert = () => Alert.alert(won ? 'Victory!' : 'Defeat', won ? 'You won!' : 'You lost.', [{ text: 'OK', onPress: () => router.back() }]);
        if (Platform.OS === 'web') { window.alert(won ? 'Victory! You won!' : 'Defeat. You lost.'); router.back(); }
        else doAlert();
        return;
      }

      // Update state from server response
      setMatch(p => p ? { ...p, ...r.match, matchState: r.updatedState, isMyTurn: false } : p);
      const newUnits = r.updatedState.units;
      setUnits(newUnits);

      // Snap anim positions to match server state
      for (const u of newUnits) {
        const { sx, sy } = tileScreenPos(u.position.x, u.position.y);
        snapUnitAnimPos(u.instanceId, sx, sy);
        if (!u.isAlive) triggerUnitAnim(u.instanceId, 'hit');
      }

      setActions([]); setMoved(new Set()); setActed(new Set());
      setSelUnit(null); setPhase('idle'); setPendingAbility(null);
      setMsg('Turn submitted! Waiting for opponent.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit turn');
    } finally { setSubmitting(false); }
  };

  const handleForfeit = () => {
    const doForfeit = async () => { await forfeitMatch(id); router.back(); };
    if (Platform.OS === 'web') {
      if (window.confirm('Forfeit this match?')) void doForfeit();
    } else {
      Alert.alert('Forfeit?', 'Are you sure you want to forfeit?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Forfeit', style: 'destructive', onPress: () => void doForfeit() },
      ]);
    }
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator color={Colors.primary} style={{ flex: 1 }} /></SafeAreaView>;
  if (!match)  return <SafeAreaView style={s.container}><Text style={{ color: Colors.danger, padding: 20 }}>Match not found</Text></SafeAreaView>;

  const selData = selUnit ? units.find(u => u.instanceId === selUnit.instanceId) : null;
  const selAbilities = (selData?.abilities ?? []).map(slug => abilityDefs.get(slug)).filter(Boolean) as AbilityDef[];

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.hdr}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={s.turnTxt}>Turn {match.turnNumber}</Text>
          <Badge label={isMyTurn ? 'YOUR TURN' : 'WAITING'} color={isMyTurn ? Colors.success : Colors.textMuted} />
        </View>
        <TouchableOpacity onPress={handleForfeit}><Text style={s.forf}>Forfeit</Text></TouchableOpacity>
      </View>

      {/* Message bar */}
      {!!msg && <View style={s.msgBar}><Text style={s.msgTxt}>{msg}</Text></View>}

      {/* Board */}
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.sm }}>
          <View style={{ width: BS * TILE, height: BS * TILE }}>
            {/* Tile layer */}
            {Array.from({ length: BS }).map((_, y) =>
              Array.from({ length: BS }).map((_, x) => {
                const hl = getTileHighlight(x, y, phase, selUnit, units, myId, pendingAbility);
                const base = (x + y) % 2 === 0 ? '#3d3d6b' : '#2d2d52';
                const color = TILE_COLORS[hl] ?? base;
                return (
                  <TouchableOpacity
                    key={`${x},${y}`}
                    onPress={() => onTile(x, y)}
                    activeOpacity={0.8}
                    style={{ position: 'absolute', left: x * TILE, top: y * TILE, width: TILE, height: TILE, backgroundColor: color }}
                  />
                );
              })
            )}

            {/* Unit layer — animated positions */}
            {units.filter(u => u.isAlive).map(u => {
              const team = u.ownerPlayerId === p1Id ? 'p1' : 'p2';
              const { sx, sy } = tileScreenPos(u.position.x, u.position.y);
              const animPos = getUnitAnimPos(u.instanceId, sx, sy);
              const scale = UNIT_CELL / SPRITE_FRAME_W;
              const feetY = SPRITE_FEET_Y * scale;
              const hp = u.currentHealth / u.maxHealth;
              return (
                <Animated.View
                  key={u.instanceId}
                  style={{ position: 'absolute', left: animPos.x, top: Animated.subtract(animPos.y, feetY - TILE / 2) }}
                  pointerEvents="none"
                >
                  <UnitFigure unitId={u.instanceId} slug={u.definitionSlug} team={team} />
                  {/* HP bar */}
                  <View style={{ position: 'absolute', bottom: -6, left: 2, right: 2, height: 3, backgroundColor: Colors.danger + '44', borderRadius: 2 }}>
                    <View style={{ width: `${hp * 100}%`, height: '100%', backgroundColor: hp > 0.5 ? Colors.success : hp > 0.25 ? Colors.warning : Colors.danger, borderRadius: 2 }} />
                  </View>
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Action panel — only on my turn */}
      {isMyTurn && (
        <View style={s.panel}>
          {selData && phase === 'selected' ? (
            <View style={{ gap: Spacing.xs }}>
              <Text style={s.selName}>{selData.definitionSlug.replace(/_/g, ' ')}</Text>
              <Text style={s.selHp}>HP {selData.currentHealth} / {selData.maxHealth}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs }}>
                  {!moved.has(selData.instanceId) && !selData.hasMovedThisTurn && (
                    <TouchableOpacity style={s.actBtn} onPress={() => { setPhase('moving'); setMsg('Tap a highlighted tile to move'); }}>
                      <Text style={s.actTxt}>Move</Text>
                    </TouchableOpacity>
                  )}
                  {!acted.has(selData.instanceId) && !selData.hasActedThisTurn && selAbilities.map(ability => (
                    <TouchableOpacity key={ability.slug} style={[s.actBtn, s.ablBtn]} onPress={() => { setPendingAbility(ability); setPhase('targeting'); setMsg('Tap an enemy to use ' + ability.name); }}>
                      <Text style={s.actTxt}>{ability.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : (
            <Text style={s.hint}>
              {phase === 'moving' ? 'Tap a blue tile to move' : phase === 'targeting' ? 'Tap an enemy (red = valid target)' : 'Tap one of your units'}
            </Text>
          )}
          <View style={s.endRow}>
            {(phase === 'moving' || phase === 'targeting') && (
              <Button title="Cancel" onPress={() => { setPhase('selected'); setPendingAbility(null); setMsg(''); }} variant="ghost" size="sm" />
            )}
            <Button title="End Turn" onPress={endTurn} loading={submitting} size="sm" />
          </View>
        </View>
      )}

      {!isMyTurn && match.status === 'active' && (
        <View style={s.wait}><Text style={s.waitTxt}>Waiting for opponent's move...</Text></View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  back: { color: Colors.primary, fontSize: FontSize.md },
  turnTxt: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  forf: { color: Colors.danger, fontSize: FontSize.sm },
  msgBar: { backgroundColor: Colors.primary + '22', padding: Spacing.sm, alignItems: 'center' },
  msgTxt: { color: Colors.primary, fontSize: FontSize.sm },
  panel: { backgroundColor: Colors.bgCard, borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  selName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', textTransform: 'capitalize' },
  selHp: { color: Colors.textSecondary, fontSize: FontSize.sm },
  actBtn: { backgroundColor: Colors.primary + '33', borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderWidth: 1, borderColor: Colors.primary },
  ablBtn: { backgroundColor: Colors.warning + '22', borderColor: Colors.warning },
  actTxt: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600', textTransform: 'capitalize' },
  hint: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
  endRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  wait: { backgroundColor: Colors.bgCard, borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, alignItems: 'center' },
  waitTxt: { color: Colors.textSecondary, fontSize: FontSize.sm },
});
