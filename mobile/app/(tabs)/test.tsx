import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, Radius } from '../../src/components/theme';
import { Button, Badge } from '../../src/components/ui';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Pos { x: number; y: number }
interface Ability {
  slug: string; name: string; range: number; isSpecial: boolean;
  damage?: number; heal?: number;
  targetAlly?: boolean; targetSelf?: boolean;
  aoeAroundSelf?: boolean; aoeRadius?: number;
  assassinate?: boolean; piercing?: boolean;
  unblockable?: boolean; // bypasses AC roll — always hits for full damage
  freeze?: boolean;      // target skips their next turn (no damage)
}
interface UnitTemplate {
  name: string; maxHp: number; moveRange: number; ac: number;
  basic: Ability; special: Ability;
}
interface Unit {
  id: string; slug: string; name: string; owner: string; pos: Pos;
  hp: number; maxHp: number; ac: number; alive: boolean;
  moved: boolean; orangeUsed: boolean; specialUsed: boolean;
  moveRange: number; basic: Ability; special: Ability;
  frozenTurns: number;
}
interface GS {
  units: Unit[]; turn: number; active: string; log: string[];
  // Initiative: order in which units appear in the tracker
  // Each entry is a unit id. Built up over first round, then fixed.
  initiativeOrder: string[]; // full interleaved order [p1unit, p2unit, p1unit, ...]
  roundInitPos: number; // current position in initiativeOrder
  // Which units have been used this round
  usedThisRound: Set<string>;
  // Units each player still must use this round (before order is fixed)
  p1Queue: string[]; // unit ids in the order they were first used
  p2Queue: string[];
  orderFixed: boolean; // true after all 8 units have appeared once
}

// ─── Unit Templates ──────────────────────────────────────────────────────────

const TEMPLATES: Record<string, UnitTemplate> = {
  barbarian: {
    name: 'Barbarian', maxHp: 50, moveRange: 4, ac: 15,
    basic:   { slug: 'strike',    name: 'Strike',       range: 1, isSpecial: false, damage: 15 },
    special: { slug: 'whirlwind', name: 'Whirlwind',    range: 1, isSpecial: true,  damage: 20, aoeAroundSelf: true },
  },
  cleric: {
    name: 'Cleric', maxHp: 40, moveRange: 3, ac: 19,
    basic:   { slug: 'mace',      name: 'Mace',         range: 1, isSpecial: false, damage: 6 },
    special: { slug: 'heal',      name: 'Heal',         range: 1, isSpecial: true,  heal: 9999, targetAlly: true },
  },
  fighter: {
    name: 'Fighter', maxHp: 42, moveRange: 3, ac: 20,
    basic:   { slug: 'sword',     name: 'Strike',       range: 1, isSpecial: false, damage: 10 },
    special: { slug: 'second_wind', name: 'Second Wind',range: 0, isSpecial: true,  heal: 9999, targetSelf: true },
  },
  rogue: {
    name: 'Rogue', maxHp: 35, moveRange: 4, ac: 15,
    basic:   { slug: 'twin',      name: 'Twin Strike',  range: 1, isSpecial: false, damage: 24 },
    special: { slug: 'assassinate', name: 'Assassinate',range: 1, isSpecial: true,  assassinate: true },
  },
  ranger: {
    name: 'Ranger', maxHp: 35, moveRange: 3, ac: 15,
    basic:   { slug: 'arrow',     name: 'Arrow',        range: 6, isSpecial: false, damage: 10 },
    special: { slug: 'piercing',  name: 'Piercing Shot',range: 6, isSpecial: true,  damage: 15, piercing: true },
  },
  sorcerer: {
    name: 'Sorcerer', maxHp: 30, moveRange: 3, ac: 14,
    basic:   { slug: 'bolt',      name: 'Arcane Bolt',      range: 5, isSpecial: false, damage: 8 },
    special: { slug: 'ffh',       name: 'Fire from Heaven', range: 3, isSpecial: true,  damage: 20, aoeRadius: 1 },
  },
  warlock: {
    name: 'Warlock', maxHp: 32, moveRange: 3, ac: 15,
    basic:   { slug: 'eldritch',  name: 'Eldritch Blast',   range: 4, isSpecial: false, damage: 12, unblockable: true },
    special: { slug: 'souleater', name: 'Soul Eater',        range: 4, isSpecial: true,  damage: 15, unblockable: true },
  },
  wizard: {
    name: 'Wizard', maxHp: 30, moveRange: 3, ac: 14,
    basic:   { slug: 'missile',   name: 'Magic Missile',     range: 5, isSpecial: false, damage: 8 },
    special: { slug: 'freeze',    name: 'Freeze',             range: 4, isSpecial: true,  freeze: true, unblockable: true },
  },
};

const KEYS = Object.keys(TEMPLATES);
const P1 = 'p1'; const P2 = 'p2'; const BS = 8; const TS = 44;
const HIT_BONUS = 5;
const DEFAULT_PLACEMENT: Pos[] = [{ x: 1, y: 1 }, { x: 1, y: 3 }, { x: 1, y: 5 }, { x: 1, y: 7 }];

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Manhattan distance (no diagonals)
function mdist(a: Pos, b: Pos) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
// Chebyshev distance (for adjacency checks like Whirlwind)
function cdist(a: Pos, b: Pos) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

// AC is a behind-the-scenes stat. Players see dodge % instead.
// dodge% = chance to miss = number of d20 rolls that fail / 20
// A roll of (ac - HIT_BONUS) or higher hits, so misses = (ac - HIT_BONUS - 1) rolls out of 20
// e.g. AC 15, HIT_BONUS 5: need roll ≥ 10 to hit → 9 misses out of 20 → 45% dodge
function dodgePct(ac: number): number {
  const missCount = Math.max(0, Math.min(20, ac - HIT_BONUS - 1));
  return Math.round((missCount / 20) * 100);
}

function rollHit(ac: number): boolean {
  const roll = Math.floor(Math.random() * 20) + 1;
  return roll + HIT_BONUS >= ac;
}

// Line of sight: is there any unit between attacker and target on same row, col, or diagonal?
function hasLoS(from: Pos, to: Pos, allUnits: Unit[], excludeIds: string[] = []): boolean {
  // Adjacent tiles always have LoS
  if (mdist(from, to) <= 1) return true;
  const blockers = allUnits.filter(u => u.alive && !excludeIds.includes(u.id));
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (from.x === to.x) {
    // Same column
    const minY = Math.min(from.y, to.y); const maxY = Math.max(from.y, to.y);
    return !blockers.some(u => u.pos.x === from.x && u.pos.y > minY && u.pos.y < maxY);
  }
  if (from.y === to.y) {
    // Same row
    const minX = Math.min(from.x, to.x); const maxX = Math.max(from.x, to.x);
    return !blockers.some(u => u.pos.y === from.y && u.pos.x > minX && u.pos.x < maxX);
  }
  if (Math.abs(dx) === Math.abs(dy)) {
    // True diagonal — step along it and check each intermediate cell
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    let cx = from.x + sx;
    let cy = from.y + sy;
    while (cx !== to.x || cy !== to.y) {
      if (blockers.some(u => u.pos.x === cx && u.pos.y === cy)) return false;
      cx += sx; cy += sy;
    }
    return true;
  }
  // Non-axis, non-diagonal shot — no clean blocking line exists on a grid,
  // so we allow the shot (the shooter finds a gap to fire through).
  return true;
}

// Get all units in a line (for piercing shot)
function unitsInLine(from: Pos, to: Pos, allUnits: Unit[], excludeId: string): Unit[] {
  const results: Unit[] = [];
  if (from.x === to.x) {
    const minY = Math.min(from.y, to.y); const maxY = Math.max(from.y, to.y);
    allUnits.filter(u => u.alive && u.id !== excludeId && u.pos.x === from.x && u.pos.y >= minY && u.pos.y <= maxY).forEach(u => results.push(u));
  } else if (from.y === to.y) {
    const minX = Math.min(from.x, to.x); const maxX = Math.max(from.x, to.x);
    allUnits.filter(u => u.alive && u.id !== excludeId && u.pos.y === from.y && u.pos.x >= minX && u.pos.x <= maxX).forEach(u => results.push(u));
  }
  return results;
}

// Valid move tiles: Manhattan distance, cardinal only, not occupied
function validMoveTiles(unit: Unit, allUnits: Unit[], range: number): Pos[] {
  const tiles: Pos[] = [];
  for (let x = 0; x < BS; x++) {
    for (let y = 0; y < BS; y++) {
      const d = mdist(unit.pos, { x, y });
      if (d === 0 || d > range) continue;
      if (allUnits.some(u => u.alive && u.pos.x === x && u.pos.y === y)) continue;
      // Path must be cardinal (no diagonal steps needed — just check reachability)
      tiles.push({ x, y });
    }
  }
  return tiles;
}

// BFS reachable tiles. Cardinal moves only. Enemy units block; allies pass-through; destination must be empty.
function reachableTiles(unit: Unit, allUnits: Unit[], range: number): Pos[] {
  const blocked = new Set<string>();
  const occupied = new Set<string>();
  allUnits.forEach(u => {
    if (!u.alive || u.id === unit.id) return;
    occupied.add(u.pos.x + ',' + u.pos.y);
    if (u.owner !== unit.owner) blocked.add(u.pos.x + ',' + u.pos.y);
  });
  const dist = new Map<string, number>();
  const start = unit.pos.x + ',' + unit.pos.y;
  dist.set(start, 0);
  const queue: Pos[] = [unit.pos];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur.x + ',' + cur.y)!;
    if (d >= range) continue;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= BS || ny >= BS) continue;
      const key = nx + ',' + ny;
      if (dist.has(key)) continue;
      if (blocked.has(key)) continue; // enemy blocks pathing entirely
      dist.set(key, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  const out: Pos[] = [];
  dist.forEach((_d, key) => {
    if (key === start) return;
    if (occupied.has(key)) return; // can't end on any occupied tile (incl. allies)
    const [x, y] = key.split(',').map(Number);
    out.push({ x, y });
  });
  return out;
}

function canReach(unit: Unit, allUnits: Unit[], range: number, x: number, y: number): boolean {
  return reachableTiles(unit, allUnits, range).some(t => t.x === x && t.y === y);
}

function makeUnit(slug: string, owner: string, pos: Pos, i: number, displayName: string): Unit {
  const t = TEMPLATES[slug];
  return {
    id: owner + '_' + slug + '_' + i, slug, name: displayName, owner, pos,
    hp: t.maxHp, maxHp: t.maxHp, ac: t.ac, alive: true,
    moved: false, orangeUsed: false, specialUsed: false,
    moveRange: t.moveRange, basic: t.basic, special: t.special,
    frozenTurns: 0,
  };
}

// Build display names: if a slug appears more than once on the same team,
// append -1, -2 etc. Single copies keep the plain name.
function buildDisplayNames(slugs: string[]): string[] {
  const counts: Record<string, number> = {};
  slugs.forEach(s => { counts[s] = (counts[s] ?? 0) + 1; });
  const seen: Record<string, number> = {};
  return slugs.map(s => {
    if (counts[s] === 1) return TEMPLATES[s].name;
    seen[s] = (seen[s] ?? 0) + 1;
    return TEMPLATES[s].name + '-' + seen[s];
  });
}

function mirrorPos(pos: Pos): Pos { return { x: 7 - pos.x, y: pos.y }; }

function makeGame(t1: string[], t1Pos: Pos[], t2: string[], t2Pos: Pos[]): GS {
  const p1Mirror = Math.random() < 0.5;
  const p1Pos = p1Mirror ? t1Pos.map(mirrorPos) : t1Pos;
  const p2Pos = p1Mirror ? t2Pos : t2Pos.map(mirrorPos);
  const p1Names = buildDisplayNames(t1);
  const p2Names = buildDisplayNames(t2);
  const units = [
    ...t1.map((s, i) => makeUnit(s, P1, p1Pos[i], i, p1Names[i])),
    ...t2.map((s, i) => makeUnit(s, P2, p2Pos[i], i, p2Names[i])),
  ];
  return {
    units, turn: 1, active: P1,
    log: ['Turn 1: Player 1 (Blue)' + (p1Mirror ? ' — starts right' : ' — starts left')],
    initiativeOrder: [], roundInitPos: 0,
    usedThisRound: new Set(),
    p1Queue: [], p2Queue: [],
    orderFixed: false,
  };
}

// ─── Team Picker ─────────────────────────────────────────────────────────────

function TeamPicker({ label, team, onChange }: { label: string; team: string[]; onChange: (t: string[]) => void }) {
  return (
    <View style={s.tp}>
      <Text style={s.tpl}>{label}</Text>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={s.slotRow}>
          <Text style={s.slotN}>Slot {i + 1}:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {KEYS.map(slug => {
              const t = TEMPLATES[slug];
              return (
                <TouchableOpacity key={slug} style={[s.chip, team[i] === slug && s.chipSel]} onPress={() => { const n = [...team]; n[i] = slug; onChange(n); }}>
                  <Text style={[s.chipT, team[i] === slug && s.chipTS]}>{t.name}</Text>
                  <Text style={s.chipSub}>HP{t.maxHp} Dodge{dodgePct(t.ac)}% MV{t.moveRange}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

// ─── Placement Board ─────────────────────────────────────────────────────────

function PlacementBoard({ slugs, placement, onChange }: {
  slugs: string[]; placement: (Pos | null)[]; onChange: (p: (Pos | null)[]) => void;
}) {
  const nextToPlace = placement.findIndex(p => p === null);
  const handleTile = (x: number, y: number) => {
    if (x > 3) return;
    const existing = placement.findIndex(p => p && p.x === x && p.y === y);
    if (existing !== -1) { const next = [...placement]; next[existing] = null; onChange(next); return; }
    if (nextToPlace === -1) return;
    const next = [...placement]; next[nextToPlace] = { x, y }; onChange(next);
  };
  return (
    <View>
      <Text style={s.placeLabel}>
        {nextToPlace !== -1 ? 'Place ' + TEMPLATES[slugs[nextToPlace]].name + ' (' + (nextToPlace + 1) + '/4)' : 'All placed! Tap to reposition.'}
      </Text>
      <View style={s.placeBoard}>
        {Array.from({ length: BS }).map((_, y) => (
          <View key={y} style={s.row}>
            {Array.from({ length: BS }).map((_, x) => {
              const unitIdx = placement.findIndex(p => p && p.x === x && p.y === y);
              const isLeft = x <= 3;
              const isAvail = isLeft && unitIdx === -1 && nextToPlace !== -1;
              return (
                <TouchableOpacity key={x} style={[s.tile, unitIdx !== -1 ? s.tSel : isAvail ? s.tMove : isLeft ? ((x + y) % 2 === 0 ? s.tL : s.tD) : s.tDisabled]} onPress={() => handleTile(x, y)} disabled={!isLeft}>
                  {unitIdx !== -1 && <View style={[s.uMark, { backgroundColor: Colors.primary }]}><Text style={s.uLbl}>{TEMPLATES[slugs[unitIdx]].name.charAt(0)}</Text><Text style={s.uNum}>{unitIdx + 1}</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
      <View style={s.placeLegend}>
        {slugs.map((slug, i) => {
          const pos = placement[i];
          return <View key={i} style={[s.legendItem, pos && s.legendPlaced]}><Text style={s.legendNum}>{i + 1}</Text><Text style={s.legendName}>{TEMPLATES[slug].name}</Text>{pos && <Text style={s.legendPos}> ({pos.x},{pos.y})</Text>}</View>;
        })}
      </View>
    </View>
  );
}

// ─── Initiative Bar ──────────────────────────────────────────────────────────

// ─── Initiative Bar ───────────────────────────────────────────────────────────
// Each slot shows a bust-shot cropped from frame 0 (idle south) of the unit's sprite strip.
// Frame 0 occupies pixels x=0..221 of the 1776px-wide strip.
// BUST_ constants defined after SPRITE_FRAME_W below — see "Sprite Map" section.

function InitiativeBar({ gs, units, activeUnitId, hoverUnitId, onHoverUnit }: {
  gs: GS; units: Unit[]; activeUnitId: string | null;
  hoverUnitId: string | null;
  onHoverUnit: (id: string | null) => void;
}) {
  const order = gs.initiativeOrder;
  const allUnits = [...units];
  const totalSlots = gs.orderFixed ? order.length : allUnits.length;
  const slots: (Unit | null)[] = order.map(id => allUnits.find(u => u.id === id) ?? null);
  while (slots.length < totalSlots) slots.push(null);

  return (
    <View style={s.initBar}>
      <Text style={s.initLabel}>Initiative:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.initScroll}>
        {slots.map((unit, i) => {
          const isDead   = !!unit && !unit.alive;
          const isActive = !!unit && unit.id === activeUnitId && unit.alive;
          const isUsed   = !!unit && gs.usedThisRound.has(unit.id) && unit.id !== activeUnitId && unit.alive;
          const isFrozen = !!unit && unit.frozenTurns > 0;
          const isHighlighted = !!unit && unit.id === hoverUnitId;
          const bustSource = unit ? (SPRITE_MAP[unit.slug] ?? FALLBACK_SPRITE)[unit.owner]?.s : null;
          return (
            <View
              key={i}
              // @ts-ignore — web mouse events
              onMouseEnter={() => unit && onHoverUnit(unit.id)}
              onMouseLeave={() => onHoverUnit(null)}
              style={[
                s.initSlot,
                isActive      && s.initSlotActive,
                isUsed        && s.initSlotUsed,
                isDead        && s.initSlotDead,
                !unit         && s.initSlotEmpty,
                isHighlighted && s.initSlotHighlighted,
              ]}>
              {unit && bustSource ? (
                <>
                  <View style={{ width: BUST_SLOT_W, height: BUST_SLOT_H, overflow: 'hidden', borderRadius: 6 }}>
                    <Image
                      source={bustSource}
                      style={{ width: BUST_SHEET_W, height: BUST_SHEET_H }}
                      resizeMode="stretch"
                    />
                    {isDead && (
                      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(160,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>✕</Text>
                      </View>
                    )}
                    {isFrozen && !isDead && <View style={{ position: 'absolute', top: 2, right: 3 }}><Text style={{ fontSize: 13 }}>❄</Text></View>}
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: unit.owner === P1 ? Colors.playerOne : Colors.playerTwo }} />
                  </View>
                  <Text style={[s.initHp, { marginTop: 2 }]}>{isDead ? '' : `${unit.hp}/${unit.maxHp}`}</Text>
                </>
              ) : (
                <Text style={s.initQ}>?</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Sprite Map ───────────────────────────────────────────────────────────────
// Each unit has 4 directional sprite sheets: _s, _n, _e, _w.
// Each sheet is 1 row × 8 frames (1776×271px).
// Frame layout: [0]idle [1]walk_L [2]idle [3]walk_R [4]atk_windup [5]atk_release [6]hit [7]dodge
// Frame 2 is a duplicate of frame 0 — only 7 unique images needed per direction.
const SPRITE_FRAME_W = 222;
const SPRITE_FRAME_H = 271;
const SPRITE_FEET_Y  = 245; // px from top of frame to ground/feet

// Initiative bust-shot dimensions — derived from sprite frame size
const BUST_SLOT_W  = 52;
const BUST_SLOT_H  = 64;
const BUST_SCALE   = BUST_SLOT_W / SPRITE_FRAME_W;        // ≈ 0.234
const BUST_SHEET_W = SPRITE_FRAME_W * 8 * BUST_SCALE;     // full strip rendered width
const BUST_SHEET_H = SPRITE_FRAME_H * BUST_SCALE;         // full strip rendered height

type FacingDir = 's' | 'n' | 'e' | 'w';

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
// Per-slug horizontal offset — kept for fine-tuning if needed, but zeroed out
// now that all sprites are centered in their frame cells.
const SPRITE_OFFSET_X: Record<string, number> = {};

// ─── Facing Direction System ──────────────────────────────────────────────────
//
// Rules (in priority order for persistence):
//   1. Moving: face the direction of movement. Keep that facing after move ends.
//   2. Attacking: face the target. Keep that facing after attack ends.
//   3. Being attacked (off-turn): face the attacker. Keep until overridden.
//   4. Start of match: face the opposing team (p1 faces east, p2 faces west).
//
// Diagonal resolution: prioritize E/W over N/S.
//   dx=+1 → east, dx=-1 → west (regardless of dy)
//   dy only used when dx=0: dy=+1 → south, dy=-1 → north

// Global facing state — keyed by unit id. Lives outside React to avoid re-renders.
const _unitFacing = new Map<string, FacingDir>();

function getFacing(unitId: string): FacingDir {
  return _unitFacing.get(unitId) ?? 's';
}

function setFacing(unitId: string, dir: FacingDir) {
  _unitFacing.set(unitId, dir);
}

// Compute the facing direction from one position toward another.
// E/W takes priority over N/S for diagonals.
function dirToward(from: Pos, to: Pos): FacingDir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx > 0) return 'e';
  if (dx < 0) return 'w';
  if (dy > 0) return 's';
  if (dy < 0) return 'n';
  return 'e'; // same tile — no change
}

// ─── Pathfinding ─────────────────────────────────────────────────────────────
//
// Builds a step-by-step path from (sx,sy) to (tx,ty) using BFS, treating
// enemy units as obstacles. Friendly units are passable (ignored as blockers).
// Returns an ordered array of Pos steps NOT including the start position.
//
// Diagonal preference: N/S before E/W so that e.g. moving NE goes N first,
// then E — matching the attack direction priority (E/W > N/S means you end
// facing E, which is correct since the last step is eastward).

function buildPath(from: Pos, to: Pos, allUnits: Unit[], movingId: string): Pos[] {
  const owner = allUnits.find(u => u.id === movingId)?.owner;
  // Cells blocked by living enemy units
  const blocked = new Set<string>(
    allUnits
      .filter(u => u.alive && u.id !== movingId && u.owner !== owner)
      .map(u => `${u.pos.x},${u.pos.y}`)
  );

  const key = (p: Pos) => `${p.x},${p.y}`;
  const visited = new Set<string>([key(from)]);
  const parent = new Map<string, Pos>();
  const queue: Pos[] = [from];

  // BFS neighbour order: N, S, E, W — cardinal only.
  // We don't step diagonally; the "N before E" preference naturally emerges
  // because we enqueue N before E.
  const DIRS: Pos[] = [
    { x: 0, y: -1 }, // N
    { x: 0, y:  1 }, // S
    { x: -1, y: 0 }, // W
    { x:  1, y: 0 }, // E
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) {
      // Reconstruct path
      const path: Pos[] = [];
      let node: Pos = to;
      while (key(node) !== key(from)) {
        path.unshift(node);
        node = parent.get(key(node))!;
      }
      return path;
    }
    for (const d of DIRS) {
      const next: Pos = { x: cur.x + d.x, y: cur.y + d.y };
      const k = key(next);
      if (next.x < 0 || next.x >= BS || next.y < 0 || next.y >= BS) continue;
      if (visited.has(k)) continue;
      // Only block on enemies; friendly units are passable
      if (blocked.has(k) && !(next.x === to.x && next.y === to.y)) continue;
      visited.add(k);
      parent.set(k, cur);
      queue.push(next);
    }
  }
  // No path found — return direct step as fallback
  return [to];
}

// Animate a unit along a series of waypoints, one tile at a time.
// Facing updates at each step. Calls onComplete when the last tile is reached.
const STEP_DURATION_MS = 560; // ms per tile


function animateUnitAlongPath(
  unitId: string,
  path: Pos[],
  onComplete?: () => void
) {
  if (path.length === 0) { onComplete?.(); return; }

  const [next, ...rest] = path;
  const { sx, sy } = tileScreenPos(next.x, next.y);

  // Update facing for this step
  const av = _unitAnimPos.get(unitId);
  if (av) {
    // Derive current logical tile from the animated value's current position
    // so we can determine direction — we just use the path step direction.
  }

  Animated.timing(_unitAnimPos.get(unitId)!, {
    toValue: { x: sx, y: sy },
    duration: STEP_DURATION_MS,
    useNativeDriver: false,
  }).start(({ finished }) => {
    if (!finished) return;
    if (rest.length === 0) {
      onComplete?.();
    } else {
      animateUnitAlongPath(unitId, rest, onComplete);
    }
  });
}


//
// Each unit has an Animated.ValueXY tracking its VISUAL screen position (sx, sy).
// Game logic updates pos instantly; the visual position tweens to match.
// This gives smooth tile-to-tile movement without touching any game state.

const _unitAnimPos = new Map<string, Animated.ValueXY>();

function getUnitAnimPos(unitId: string, sx: number, sy: number): Animated.ValueXY {
  if (!_unitAnimPos.has(unitId)) {
    _unitAnimPos.set(unitId, new Animated.ValueXY({ x: sx, y: sy }));
  }
  return _unitAnimPos.get(unitId)!;
}

function initUnitAnimPos(unitId: string, sx: number, sy: number) {
  if (!_unitAnimPos.has(unitId)) {
    _unitAnimPos.set(unitId, new Animated.ValueXY({ x: sx, y: sy }));
  }
}

// Animate a unit's visual position from wherever it currently is to (sx, sy).
// Duration matches the walk animation. Calls onComplete when done.
const MOVE_DURATION_MS = 320;

function animateUnitMove(unitId: string, toSx: number, toSy: number, onComplete?: () => void) {
  const av = _unitAnimPos.get(unitId);
  if (!av) { onComplete?.(); return; }
  Animated.timing(av, {
    toValue: { x: toSx, y: toSy },
    duration: MOVE_DURATION_MS,
    useNativeDriver: false,
  }).start(({ finished }) => {
    if (finished) onComplete?.();
  });
}

// Immediately snap visual position (no animation) — used on reset / init
function snapUnitAnimPos(unitId: string, sx: number, sy: number) {
  const av = _unitAnimPos.get(unitId);
  if (av) { av.setValue({ x: sx, y: sy }); }
}


//
// Each directional sprite sheet is 1 row × 8 frames (cols=8, rows=1):
//   [0] idle  [1] walk_left  [2] idle(reuse)  [3] walk_right
//   [4] atk_windup  [5] atk_release  [6] hit  [7] dodge
// Note: frame 2 is a duplicate of frame 0 (idle reused as walk mid-step).
// Only 7 unique images are needed per direction — the assembly script
// places idle at both F0 and F2.

type AnimName = 'idle' | 'walk' | 'attack' | 'hit' | 'dodge';

const ANIM_FRAMES: Record<AnimName, number[]> = {
  idle:   [0],
  walk:   [1, 3],          // left foot, right foot — no idle pause mid-step
  attack: [4, 5, 0],       // windup, release, return to idle
  hit:    [6, 0],
  dodge:  [7, 0],
};
// FPS per animation. Walk is timed to STEP_DURATION_MS (4 frames per tile).
const WALK_FPS = 2000 / STEP_DURATION_MS; // 2 frames per tile, each = STEP_DURATION_MS/2
const ANIM_FPS: Record<AnimName, number> = {
  idle: 1, walk: WALK_FPS, attack: 2, hit: 1.5, dodge: 1.5,
};

// Trigger a walk step — plays [left foot, right foot] timed to STEP_DURATION_MS.
// timed to exactly STEP_DURATION_MS (one frame per STEP_DURATION_MS/4 ms).
function triggerUnitAnimStep(unitId: string, _stepIndex: number) {
  triggerUnitAnim(unitId, 'walk');
}

// Callback registry for triggering animations from game logic
const _animCallbacks = new Map<string, (anim: AnimName) => void>();

function triggerUnitAnim(unitId: string, anim: AnimName) {
  _animCallbacks.get(unitId)?.(anim);
}

// Trigger an animation and also update facing direction
function triggerUnitAnimFacing(unitId: string, anim: AnimName, dir: FacingDir) {
  setFacing(unitId, dir);
  triggerUnitAnim(unitId, anim);
}

function UnitFigure({ unitId, slug, owner, opacity = 1, cellSize = 80 }: {
  unitId: string; slug: string; owner: string; opacity?: number; cellSize?: number;
}) {
  // Sprite sheet: 8 cols × 1 row per directional file (1776×271px, frame 222×271px)
  const COLS = 8;
  // Scale: map source frame width (222px) to cellSize so sprites fill the cell horizontally
  const scale  = cellSize / SPRITE_FRAME_W;
  const frameH = SPRITE_FRAME_H * scale;  // rendered height of the full sprite frame
  const feetY  = SPRITE_FEET_Y  * scale;  // where feet land within that rendered frame

  const [animState, setAnimState] = useState<{ anim: AnimName; frame: number; lockedUntil: number }>(
    { anim: 'idle', frame: 0, lockedUntil: 0 }
  );
  // Track facing separately — changes cause re-render to swap sprite source
  const [facing, setFacingState] = useState<FacingDir>(() => getFacing(unitId));
  const animRef = useRef(animState);
  animRef.current = animState;

  // Poll facing every frame tick so direction changes are reflected immediately
  // We store facing in _unitFacing (outside React) so game logic can set it
  // without causing cascading re-renders. UnitFigure reads it on each tick.
  useEffect(() => {
    _animCallbacks.set(unitId, (anim: AnimName) => {
      const now = Date.now();
      // Walk can always interrupt walk (new step); other anims block until lockedUntil
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
    const ms = 1000 / ANIM_FPS[anim];
    const t = setTimeout(() => {
      const seq = ANIM_FRAMES[anim];
      const next = frame + 1;
      if (next >= seq.length) {
        if (anim === 'idle') {
          // Idle loops forever on frame 0
          setAnimState(s => ({ ...s, frame: 0 }));
        } else if (anim === 'walk') {
          // Walk: each trigger plays one full cycle [1,0,3,0].
          // After the cycle, hold on frame 0 (idle pose) until the next step fires.
          setAnimState(s => ({ ...s, anim: 'idle', frame: 0, lockedUntil: 0 }));
        } else if (lockedUntil > Date.now()) {
          setAnimState(s => ({ ...s, frame: 0 }));
        } else {
          setFacingState(getFacing(unitId));
          setAnimState({ anim: 'idle', frame: 0, lockedUntil: 0 });
        }
      } else {
        setAnimState(s => ({ ...s, frame: next }));
      }
    }, ms);
    return () => clearTimeout(t);
  }, [animState]);

  const teamSprites = SPRITE_MAP[slug] ?? FALLBACK_SPRITE;
  const dirSprites  = teamSprites[owner] ?? teamSprites.p1;
  const source      = dirSprites[facing];

  const seq     = ANIM_FRAMES[animState.anim];
  const flatIdx = seq[Math.min(animState.frame, seq.length - 1)];
  // Sheet is 8 cols × 1 row — col = flatIdx, row always 0
  const col = flatIdx;

  return (
    // The clip window is cellSize wide × feetY tall — we only show from the top
    // of the frame down to the feet. The container is positioned so its bottom
    // edge sits exactly at the tile center (feet anchor point).
    <View style={{ width: cellSize, height: feetY, overflow: 'hidden', opacity }}>
      <Image
        source={source}
        style={{
          width: cellSize * COLS,
          height: frameH,
          // @ts-ignore
          transform: [{ translateX: -col * cellSize }, { translateY: 0 }],
        }}
        resizeMode="stretch"
      />
    </View>
  );
}


// ─── True Isometric Board ─────────────────────────────────────────────────────
//
// ─── Board rendering — flat grid tilted with CSS rotateX ─────────────────────
const TILE = 60;
const TILT_DEG = 62;
const TILT = TILT_DEG + 'deg';
const TILT_COS = Math.cos(TILT_DEG * Math.PI / 180);

const GRID_PX = TILE * BS;

// Unit screen position: tile center after rotateX compression
function tileScreenPos(gx: number, gy: number) {
  return {
    sx: gx * TILE + TILE / 2,
    sy: gy * TILE * TILT_COS + TILE * TILT_COS / 2,
  };
}

const UNIT_CELL = 56;  // cellSize passed to UnitFigure (scales sprite to this width)
// Feet land at SPRITE_FEET_Y/SPRITE_FRAME_W * UNIT_CELL pixels below the sprite top
const UNIT_FEET_OFFSET = Math.round((SPRITE_FEET_Y / SPRITE_FRAME_W) * UNIT_CELL);
// Visible clip height = from top of sprite down to feet
const UNIT_CLIP_H = UNIT_FEET_OFFSET;
const UNIT_W = UNIT_CELL;

const ISO_FILL: Record<string, string> = {
  light:       '#3d3d6b',
  dark:        '#2d2d52',
  sel:         '#4a7aee',   // selected unit's tile — bright blue
  move:        '#1a4aaa',   // reachable move tiles — blue
  charge:      '#994400',   // charge tiles — dark orange
  tgt:         '#cc4400',   // attackable enemy tile — bright orange-red
  range:       '#7a1a1a',   // in-range tile — dark red, shows weapon reach
  heal:        '#1a6b35',   // healable ally tile — green
  attack:      '#aa1a1a',
  special:     '#8a2be2',
  selected:    '#4a7aee',
  frozenMove:  '#1a3a7a',
};
const ISO_EDGE = '#55557788';




type SetupPhase = 'teams' | 'place1' | 'place2' | 'playing';
type Mode = 'move' | 'basic' | 'special' | 'charge';

export default function TestScreen() {
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('teams');
  const [t1, setT1] = useState(['barbarian', 'cleric', 'fighter', 'rogue']);
  const [t2, setT2] = useState(['ranger', 'sorcerer', 'barbarian', 'fighter']);
  const [p1Placement, setP1Placement] = useState<(Pos | null)[]>([...DEFAULT_PLACEMENT]);
  const [p2Placement, setP2Placement] = useState<(Pos | null)[]>([...DEFAULT_PLACEMENT]);
  const [gs, setGs] = useState<GS | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('move');
  const [committedId, setCommittedId] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [hoverTile, setHoverTile] = useState<string | null>(null);
  const [hoverUnitId, setHoverUnitId] = useState<string | null>(null); // cross-highlights board ↔ initiative bar
  const [pressedTile, setPressedTile] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const allPlaced = (p: (Pos | null)[]) => p.every(x => x !== null);

  const startGame = () => {
    const game = makeGame(t1, p1Placement as Pos[], t2, p2Placement as Pos[]);
    setGs(game); setUnits(game.units); setSelId(null);
    setMode('move'); setCommittedId(null); setSetupPhase('playing');
  };

  const resetGame = () => {
    setSetupPhase('teams'); setGs(null); setUnits([]);
    setSelId(null); setCommittedId(null);
    setP1Placement([...DEFAULT_PLACEMENT]); setP2Placement([...DEFAULT_PLACEMENT]);
    _unitAnimPos.clear();
    _unitFacing.clear();
  };

  const boardMap = useMemo(() => {
    const map = new Map<string, Unit>();
    units.forEach(u => { if (u.alive) map.set(u.pos.x + ',' + u.pos.y, u); });
    return map;
  }, [units]);

  const getAt = useCallback((x: number, y: number) => boardMap.get(x + ',' + y) ?? null, [boardMap]);
  const getSel = () => selId ? units.find(u => u.id === selId) ?? null : null;

  const checkWin = (u: Unit[]) => {
    const p1 = u.some(u => u.owner === P1 && u.alive);
    const p2 = u.some(u => u.owner === P2 && u.alive);
    if (!p1 || !p2) Alert.alert('Match Over', (p1 ? 'Player 1' : 'Player 2') + ' wins!', [{ text: 'Play Again', onPress: resetGame }]);
    return !p1 || !p2;
  };

  // Register unit in initiative order when it first acts.
  // Never marks orderFixed here — that only happens in endTurn once both
  // players have drafted all 4 units.
  // Initialize facing and animated positions when units first appear
  useEffect(() => {
    if (units.length > 0) {
      units.forEach(u => {
        if (!_unitFacing.has(u.id)) {
          setFacing(u.id, u.owner === P1 ? 'e' : 'w');
        }
        // Initialize visual position to match logical position
        const { sx, sy } = tileScreenPos(u.pos.x, u.pos.y);
        initUnitAnimPos(u.id, sx, sy);
      });
    }
  }, [units.length]);

  const registerInitiative = (unitId: string, currentGs: GS, owner: string): GS => {
    // Only add to the order if this unit hasn't appeared yet — prevents duplicates
    // when a unit both moves and attacks in the same turn.
    if (currentGs.initiativeOrder.includes(unitId)) return currentGs;
    const newOrder = [...currentGs.initiativeOrder, unitId];
    const newP1Queue = owner === P1 ? [...currentGs.p1Queue, unitId] : currentGs.p1Queue;
    const newP2Queue = owner === P2 ? [...currentGs.p2Queue, unitId] : currentGs.p2Queue;
    return { ...currentGs, initiativeOrder: newOrder, p1Queue: newP1Queue, p2Queue: newP2Queue };
  };

  // Execute ability and return new units array
  const executeAbility = (sel: Unit, ability: Ability, target: Unit | null, tx: number, ty: number, curUnits: Unit[], log: string[]): Unit[] => {
    let nu = [...curUnits];

    // Self heal
    if (ability.targetSelf) {
      nu = nu.map(u => { if (u.id !== sel.id) return u; const hp = u.maxHp; log.push(sel.name + ' uses ' + ability.name + ' — full HP restored'); return { ...u, hp }; });
      return nu;
    }

    // Whirlwind — AOE around self, hits all adjacent enemies
    if (ability.aoeAroundSelf) {
      const targets = nu.filter(u => u.owner !== sel.owner && u.alive && cdist(sel.pos, u.pos) === 1);
      if (targets.length === 0) { log.push('Whirlwind — no adjacent enemies'); return nu; }
      for (const t of targets) {
        const hit = rollHit(t.ac);
        if (hit) { const hp = Math.max(0, t.hp - (ability.damage ?? 0)); log.push('Whirlwind hits ' + t.name + ' for ' + ability.damage); nu = nu.map(u => u.id === t.id ? { ...u, hp, alive: hp > 0 } : u); }
        else { log.push('Whirlwind misses ' + t.name); }
      }
      return nu;
    }

    // Ally heal
    if (ability.targetAlly && ability.heal && target) {
      const hp = target.maxHp; log.push(sel.name + ' heals ' + target.name + ' to full HP');
      return nu.map(u => u.id === target.id ? { ...u, hp } : u);
    }

    // Assassinate
    if (ability.assassinate && target) {
      if (target.hp <= 20) { log.push(sel.name + ' assassinates ' + target.name + '!'); return nu.map(u => u.id === target.id ? { ...u, hp: 0, alive: false } : u); }
      else { log.push('Assassinate failed — ' + target.name + ' has ' + target.hp + ' HP (need ≤20)'); return nu; }
    }

    // Piercing Shot — hits all units in line
    if (ability.piercing && target) {
      const lineTargets = unitsInLine(sel.pos, { x: tx, y: ty }, nu, sel.id);
      if (lineTargets.length === 0) { log.push('Piercing Shot — no targets in line'); return nu; }
      for (const t of lineTargets) {
        const hit = rollHit(t.ac);
        if (hit) { const hp = Math.max(0, t.hp - (ability.damage ?? 0)); log.push('Piercing hits ' + t.name + ' for ' + ability.damage); nu = nu.map(u => u.id === t.id ? { ...u, hp, alive: hp > 0 } : u); }
        else { log.push('Piercing misses ' + t.name); }
      }
      return nu;
    }

    // AOE around target (Fire from Heaven)
    if (ability.aoeRadius && ability.aoeRadius > 0) {
      const aoeTargets = nu.filter(u => u.owner !== sel.owner && u.alive && cdist(u.pos, { x: tx, y: ty }) <= ability.aoeRadius!);
      if (aoeTargets.length === 0) { log.push('Fire from Heaven — no targets in blast'); return nu; }
      for (const t of aoeTargets) {
        const hit = rollHit(t.ac);
        if (hit) { const hp = Math.max(0, t.hp - (ability.damage ?? 0)); log.push('Fire hits ' + t.name + ' for ' + ability.damage); nu = nu.map(u => u.id === t.id ? { ...u, hp, alive: hp > 0 } : u); }
        else { log.push('Fire misses ' + t.name); }
      }
      return nu;
    }

    // Freeze — unblockable, no damage, target skips next turn
    if (ability.freeze && target) {
      log.push(sel.name + ' freezes ' + target.name + '! They will skip their next turn.');
      return nu.map(u => u.id === target.id ? { ...u, frozenTurns: u.frozenTurns + 1 } : u);
    }

    // Unblockable damage — bypasses AC roll, always hits full damage
    if (ability.unblockable && ability.damage && target) {
      const hp = Math.max(0, target.hp - ability.damage);
      log.push(sel.name + ' hits ' + target.name + ' with ' + ability.name + ' for ' + ability.damage + ' (unblockable)');
      return nu.map(u => u.id === target.id ? { ...u, hp, alive: hp > 0 } : u);
    }

    // Standard single target damage
    if (ability.damage && target) {
      const hit = rollHit(target.ac);
      if (hit) { const hp = Math.max(0, target.hp - ability.damage); log.push(sel.name + ' hits ' + target.name + ' for ' + ability.damage); return nu.map(u => u.id === target.id ? { ...u, hp, alive: hp > 0 } : u); }
      else { log.push(sel.name + ' misses ' + target.name); return nu; }
    }

    return nu;
  };

  const handleAbilityButton = (newMode: Mode) => {
    const sel = getSel();
    if (!sel || !gs) return;

    // Self/AOE-self: execute immediately
    if (newMode === 'basic' || newMode === 'special') {
      const ability = newMode === 'basic' ? sel.basic : sel.special;
      if (ability.targetSelf || ability.aoeAroundSelf) {
        const log = [...gs.log];
        let newUnits = executeAbility(sel, ability, null, sel.pos.x, sel.pos.y, units, log);
        newUnits = newUnits.map(u => u.id === sel.id ? { ...u, orangeUsed: true, specialUsed: u.specialUsed || ability.isSpecial } : u);
        const newGs = registerInitiative(sel.id, { ...gs, units: newUnits, log, usedThisRound: new Set([...gs.usedThisRound]) }, sel.owner);
        setUnits(newUnits); setCommittedId(sel.id);
        setGs({ ...newGs, units: newUnits, log });
        checkWin(newUnits);
        // For AOE: face toward nearest enemy
        if (ability.aoeAroundSelf) {
          const nearest = newUnits.filter(u => u.owner !== sel.owner && u.alive)
            .sort((a, b) => mdist(sel.pos, a.pos) - mdist(sel.pos, b.pos))[0];
          if (nearest) triggerUnitAnimFacing(sel.id, 'attack', dirToward(sel.pos, nearest.pos));
          else triggerUnitAnim(sel.id, 'attack');
        } else {
          triggerUnitAnim(sel.id, 'attack');
        }
        // Default to move if not yet moved, otherwise turn will auto-end
        if (!sel.moved) setMode('move');
        return;
      }
    }
    setMode(newMode);
  };

  const handleTile = (x: number, y: number) => {
    if (!gs) return;
    const tileUnit = getAt(x, y);
    const active = gs.active;
    const sel = getSel();

    // PRIORITY 1: Move or Charge
    if (sel && (mode === 'move' || mode === 'charge')) {
      const alreadyUsed = mode === 'move' ? sel.moved : sel.orangeUsed;
      if (!alreadyUsed && !tileUnit) {
        const d = mdist(sel.pos, { x, y });
        if (d > 0 && d <= sel.moveRange && canReach(sel, units, sel.moveRange, x, y)) {
          const isCharge = mode === 'charge';
          const newUnits = units.map(u => u.id === sel.id
            ? { ...u, pos: { x, y }, moved: true, orangeUsed: isCharge ? true : u.orangeUsed }
            : u
          );
          const log = [...gs.log, sel.name + (isCharge ? ' charges' : ' moves')];
          const newGs = registerInitiative(sel.id, { ...gs, units: newUnits, log, usedThisRound: new Set([...gs.usedThisRound]) }, sel.owner);
          setUnits(newUnits); setCommittedId(sel.id);
          setGs({ ...newGs, units: newUnits, log });
          // Build a step-by-step path avoiding enemy units
          const path = buildPath(sel.pos, { x, y }, units, sel.id);

          // Suppress tile highlights during movement to avoid ghost artifacts
          setIsMoving(true);

          // Build facing-update callbacks: before each step, update the facing direction
          // animateSteps handles both facing and foot animation per step.
          const pathWithFacing = path.map((step, i) => {
            const prevPos = i === 0 ? sel.pos : path[i - 1];
            const dir = dirToward(prevPos, step);
            return { step, dir };
          });

          function animateSteps(steps: typeof pathWithFacing, stepIndex: number, onDone?: () => void) {
            if (steps.length === 0) { onDone?.(); return; }
            const [{ step, dir }, ...rest] = steps;
            const { sx: toSx, sy: toSy } = tileScreenPos(step.x, step.y);
            // Update facing and trigger the correct foot for this step
            setFacing(sel.id, dir);
            // Alternate left foot (frame 1) and right foot (frame 3) per step
            triggerUnitAnimStep(sel.id, stepIndex);
            Animated.timing(_unitAnimPos.get(sel.id)!, {
              toValue: { x: toSx, y: toSy },
              duration: STEP_DURATION_MS,
              useNativeDriver: false,
            }).start(({ finished }) => {
              if (!finished) return;
              if (rest.length > 0) {
                animateSteps(rest, stepIndex + 1, onDone);
              } else {
                onDone?.();
              }
            });
          }

          animateSteps(pathWithFacing, 0, () => {
            setIsMoving(false);
            triggerUnitAnim(sel.id, 'idle');
          });

          if (isCharge) {
            setTimeout(() => endTurn(), STEP_DURATION_MS * path.length + 50);
          } else {
            setMode('basic');
          }
          return;
        }
      }
    }

    // PRIORITY 2: Ability targeting
    if (sel && (mode === 'basic' || mode === 'special') && !sel.orangeUsed && !(mode === 'special' && sel.specialUsed)) {
      const ability = mode === 'basic' ? sel.basic : sel.special;
      if (!ability.targetSelf && !ability.aoeAroundSelf && tileUnit) {
        const d = mdist(sel.pos, { x, y });
        if (d <= ability.range) {
          // Enemy target
          if (tileUnit.owner !== active && tileUnit.alive) {
            if (!ability.piercing && !hasLoS(sel.pos, tileUnit.pos, units, [sel.id])) {
              const log = [...gs.log, 'No line of sight to ' + tileUnit.name];
              setGs({ ...gs, log }); return;
            }
            const log = [...gs.log];
            let newUnits = executeAbility(sel, ability, tileUnit, x, y, units, log);
            newUnits = newUnits.map(u => u.id === sel.id ? { ...u, orangeUsed: true, specialUsed: u.specialUsed || ability.isSpecial } : u);
            const newGs = registerInitiative(sel.id, { ...gs, units: newUnits, log, usedThisRound: new Set([...gs.usedThisRound]) }, sel.owner);
            setUnits(newUnits); setCommittedId(sel.id);
            setGs({ ...newGs, units: newUnits, log });
            // Attacker faces target; target faces attacker (being attacked)
            const atkDir = dirToward(sel.pos, tileUnit.pos);
            const hitDir = dirToward(tileUnit.pos, sel.pos);
            triggerUnitAnimFacing(sel.id, 'attack', atkDir);
            const targetAfter = newUnits.find(u => u.id === tileUnit.id);
            if (targetAfter) {
              if (!targetAfter.alive) {
                // Target died — face attacker and play hit
                triggerUnitAnimFacing(tileUnit.id, 'hit', hitDir);
              } else if (targetAfter.hp < tileUnit.hp) {
                // Hit landed — flinch
                triggerUnitAnimFacing(tileUnit.id, 'hit', hitDir);
              } else {
                // Miss — play dodge anim
                triggerUnitAnimFacing(tileUnit.id, 'dodge', hitDir);
              }
            }
            if (!checkWin(newUnits)) {
              const acted = newUnits.find(u => u.id === sel.id)!;
              if (acted.moved && acted.orangeUsed) {
                setTimeout(() => endTurn(), 300);
              } else if (!acted.moved) {
                // Used orange before moving — default to move
                setMode('move');
              }
            }
            return;
          }
          // Ally heal
          if (ability.targetAlly && tileUnit.owner === active && tileUnit.id !== sel.id) {
            const log = [...gs.log];
            let newUnits = executeAbility(sel, ability, tileUnit, x, y, units, log);
            newUnits = newUnits.map(u => u.id === sel.id ? { ...u, orangeUsed: true, specialUsed: u.specialUsed || ability.isSpecial } : u);
            const newGs = registerInitiative(sel.id, { ...gs, units: newUnits, log, usedThisRound: new Set([...gs.usedThisRound]) }, sel.owner);
            setUnits(newUnits); setCommittedId(sel.id);
            setGs({ ...newGs, units: newUnits, log });
            // Face toward the ally being healed
            triggerUnitAnimFacing(sel.id, 'attack', dirToward(sel.pos, tileUnit.pos));
            const acted = newUnits.find(u => u.id === sel.id)!;
            if (acted.moved && acted.orangeUsed) {
              setTimeout(() => endTurn(), 300);
            } else if (!acted.moved) {
              setMode('move');
            }
            return;
          }
        }
      }
    }

    // PRIORITY 3: Select own unit
    if (tileUnit && tileUnit.owner === active && tileUnit.alive) {
      // Can only act with committed unit once committed
      if (committedId && committedId !== tileUnit.id) { setInspectId(tileUnit.id); return; }
      // Enforce initiative order after it's fixed
      if (gs.orderFixed && gs.initiativeOrder.length > 0) {
        const nextId = gs.initiativeOrder[gs.roundInitPos];
        if (tileUnit.id !== nextId) { setInspectId(tileUnit.id); return; }
      } else {
        // Pre-order: can't reselect already-used unit
        if (gs.usedThisRound.has(tileUnit.id) && tileUnit.id !== committedId) { setInspectId(tileUnit.id); return; }
      }
      // Default mode: if already moved and orange not used, go to basic attack
      const defaultMode = tileUnit.moved && !tileUnit.orangeUsed ? 'basic' : 'move';
      setSelId(tileUnit.id); setInspectId(null); setMode(defaultMode); return;
    }

    // PRIORITY 4: Inspect enemy
    if (tileUnit && tileUnit.owner !== active) { setInspectId(tileUnit.id); return; }

    // PRIORITY 5: Deselect
    if (!tileUnit && !committedId) { setSelId(null); setInspectId(null); }
  };

  const endTurn = () => {
    if (!gs) return;
    const log = [...gs.log];

    let newRoundInitPos = gs.roundInitPos;
    let newUsedThisRound = new Set(gs.usedThisRound);
    let newInitOrder = [...gs.initiativeOrder];
    let orderFixedNow = gs.orderFixed;
    let nextActive = gs.active;

    let updatedUnits = units.map(u =>
      u.id === committedId ? { ...u, moved: false, orangeUsed: false } : u
    );

    if (gs.orderFixed && gs.initiativeOrder.length > 0) {
      // ── FIXED ORDER PHASE ──────────────────────────────────────────────
      const order = gs.initiativeOrder;
      let pos = gs.roundInitPos;
      let wrapped = false;

      for (let i = 0; i < order.length; i++) {
        pos = (pos + 1) % order.length;
        if (pos === 0 && !wrapped) {
          wrapped = true;
          newUsedThisRound = new Set();
          updatedUnits = updatedUnits.map(u => ({ ...u, moved: false, orangeUsed: false }));
          log.push('--- New Round ---');
        }
        const candUnit = updatedUnits.find(u => u.id === order[pos]);
        if (!candUnit || !candUnit.alive) continue; // dead — skip silently
        if (candUnit.frozenTurns > 0) {
          // Frozen — decrement and skip this turn
          updatedUnits = updatedUnits.map(u =>
            u.id === candUnit.id ? { ...u, frozenTurns: u.frozenTurns - 1 } : u
          );
          log.push(candUnit.name + ' is frozen and loses their turn!');
          continue;
        }
        break; // found next live unfrozen unit
      }

      newRoundInitPos = pos;
      nextActive = updatedUnits.find(u => u.id === order[newRoundInitPos])?.owner ?? gs.active;

    } else {
      // ── DRAFT PHASE ────────────────────────────────────────────────────
      if (committedId) newUsedThisRound.add(committedId);

      const TEAM_SIZE = 4;
      const p1Done = gs.p1Queue.length >= TEAM_SIZE;
      const p2Done = gs.p2Queue.length >= TEAM_SIZE;

      if (p1Done && p2Done) {
        const interleaved: string[] = [];
        const q1 = [...gs.p1Queue];
        const q2 = [...gs.p2Queue];
        while (q1.length > 0 || q2.length > 0) {
          if (q1.length) interleaved.push(q1.shift()!);
          if (q2.length) interleaved.push(q2.shift()!);
        }
        newInitOrder = interleaved;
        newUsedThisRound = new Set();
        orderFixedNow = true;
        log.push('--- Initiative order set! ---');
        updatedUnits = updatedUnits.map(u => ({ ...u, moved: false, orangeUsed: false }));

        let startPos = 0;
        for (let i = 0; i < interleaved.length; i++) {
          if (updatedUnits.find(u => u.id === interleaved[i] && u.alive)) { startPos = i; break; }
        }
        newRoundInitPos = startPos;
        nextActive = updatedUnits.find(u => u.id === interleaved[startPos])?.owner ?? gs.active;

      } else {
        const p1Filled = gs.p1Queue.length;
        const p2Filled = gs.p2Queue.length;
        if (p1Filled > p2Filled) nextActive = P2;
        else if (p2Filled > p1Filled) nextActive = P1;
        else nextActive = gs.active === P1 ? P2 : P1;
      }
    }

    const p1a = updatedUnits.some(u => u.owner === P1 && u.alive);
    const p2a = updatedUnits.some(u => u.owner === P2 && u.alive);
    if (!p1a || !p2a) {
      Alert.alert('Match Over', (p1a ? 'Player 1' : 'Player 2') + ' wins!', [{ text: 'Again', onPress: resetGame }]);
      return;
    }

    const nt = gs.turn + 1;
    log.push('Turn ' + nt + ': ' + (nextActive === P1 ? 'Player 1 (Blue)' : 'Player 2 (Red)'));

    setGs({ ...gs, units: updatedUnits, turn: nt, active: nextActive, log, initiativeOrder: newInitOrder, roundInitPos: newRoundInitPos, usedThisRound: newUsedThisRound, orderFixed: orderFixedNow, p1Queue: gs.p1Queue, p2Queue: gs.p2Queue });
    setUnits(updatedUnits);
    setSelId(null); setMode('move'); setCommittedId(null);
  };

  // Returns a key into ISO_FILL for the isometric tile renderer.
  const getTileTint = useCallback((x: number, y: number): string => {
    const base = (x + y) % 2 === 0 ? 'light' : 'dark';
    if (isMoving) return base; // no highlights while unit is animating
    const sel = selId ? units.find(u => u.id === selId) ?? null : null;
    if (!sel) return base;
    if (sel.pos.x === x && sel.pos.y === y) return base;

    if (mode === 'move' && !sel.moved) {
      if (canReach(sel, units, sel.moveRange, x, y)) return 'move';
    }
    if (mode === 'charge' && sel.moved && !sel.orangeUsed) {
      if (canReach(sel, units, sel.moveRange, x, y)) return 'charge';
    }
    if (mode === 'basic' || mode === 'special') {
      const ability = mode === 'basic' ? sel.basic : sel.special;
      if (!sel.orangeUsed && !(mode === 'special' && sel.specialUsed) && !ability.targetSelf && !ability.aoeAroundSelf) {
        const d = mdist(sel.pos, { x, y });
        if (d <= ability.range && d > 0) {
          const u = boardMap.get(x + ',' + y);
          const los = ability.piercing || hasLoS(sel.pos, { x, y }, units, [sel.id]);
          // Attackable enemy — orange highlight (requires LoS)
          if (u && u.owner !== sel.owner && u.alive && los) return 'tgt';
          // Healable ally — green highlight
          if (ability.targetAlly && u && u.owner === sel.owner && u.id !== sel.id) return 'heal';
          // Range indicator — show as red if LoS is clear.
          // Tiles blocked by a unit in the line of sight are not shown.
          if (los) return 'range';
        }
      }
    }
    return base;
  }, [selId, units, mode, boardMap, isMoving]);

  // ─── Setup Screens ────────────────────────────────────────────────────────

  if (setupPhase === 'teams') return (
    <SafeAreaView style={s.c}><ScrollView contentContainerStyle={s.setupScroll}>
      <Text style={s.title}>Test Mode</Text><Text style={s.sub}>Select teams, then place units</Text>
      <TeamPicker label="Player 1 (Blue)" team={t1} onChange={setT1} />
      <TeamPicker label="Player 2 (Red)" team={t2} onChange={setT2} />
      <View style={{ marginTop: Spacing.lg }}><Button title="Next: Place Player 1 Units" onPress={() => { setP1Placement([null,null,null,null]); setSetupPhase('place1'); }} size="lg" /></View>
    </ScrollView></SafeAreaView>
  );

  if (setupPhase === 'place1') return (
    <SafeAreaView style={s.c}><ScrollView contentContainerStyle={s.setupScroll}>
      <Text style={s.title}>Player 1 — Place Units</Text>
      <Text style={s.sub}>One player will be randomly mirrored to the right at match start.</Text>
      <PlacementBoard slugs={t1} placement={p1Placement} onChange={setP1Placement} />
      <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
        <Button title="Next: Place Player 2 Units" onPress={() => { setP2Placement([null,null,null,null]); setSetupPhase('place2'); }} size="lg" disabled={!allPlaced(p1Placement)} />
        <Button title="Back" onPress={() => setSetupPhase('teams')} variant="ghost" size="sm" />
      </View>
    </ScrollView></SafeAreaView>
  );

  if (setupPhase === 'place2') return (
    <SafeAreaView style={s.c}><ScrollView contentContainerStyle={s.setupScroll}>
      <Text style={s.title}>Player 2 — Place Units</Text>
      <PlacementBoard slugs={t2} placement={p2Placement} onChange={setP2Placement} />
      <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
        <Button title="Start Match" onPress={startGame} size="lg" disabled={!allPlaced(p2Placement)} />
        <Button title="Back" onPress={() => setSetupPhase('place1')} variant="ghost" size="sm" />
      </View>
    </ScrollView></SafeAreaView>
  );

  if (!gs) return null;

  const sel = getSel();
  const activePlayer = gs.active;
  // Active unit for the initiative bar: committed unit if any, else the unit
  // at the current initiative slot (direct index, not a filtered array).
  let activeUnitId: string | null = committedId;
  if (!activeUnitId && gs.orderFixed && gs.initiativeOrder.length > 0) {
    activeUnitId = gs.initiativeOrder[gs.roundInitPos] ?? null;
  }

  // Which units the active player can select.
  let selectableIds: Set<string>;
  if (gs.orderFixed && gs.initiativeOrder.length > 0) {
    const nextId = gs.initiativeOrder[gs.roundInitPos];
    selectableIds = new Set(nextId && !gs.usedThisRound.has(nextId) ? [nextId] : []);
  } else {
    selectableIds = new Set(
      units.filter(u => u.owner === activePlayer && u.alive && !gs.usedThisRound.has(u.id)).map(u => u.id)
    );
  }

  // ── AUTO-SELECT ───────────────────────────────────────────────────────────
  // After order is fixed the active unit is predetermined — auto-select it.
  // During the draft, auto-select if the player has only one unit left to pick.
  const autoSelectId: string | null = (() => {
    if (committedId) return null;
    if (gs.orderFixed && gs.initiativeOrder.length > 0) {
      const nextId = gs.initiativeOrder[gs.roundInitPos];
      const nextUnit = units.find(u => u.id === nextId && u.alive);
      return nextUnit ? nextId : null;
    } else {
      const available = units.filter(u => u.owner === activePlayer && u.alive && !gs.usedThisRound.has(u.id));
      return available.length === 1 ? available[0].id : null;
    }
  })();

  if (autoSelectId && selId !== autoSelectId) {
    setTimeout(() => {
      const unit = units.find(u => u.id === autoSelectId);
      const defaultMode = unit && unit.moved && !unit.orangeUsed ? 'basic' : 'move';
      setSelId(autoSelectId);
      setMode(defaultMode);
    }, 0);
  }

  // End Turn is disabled during the draft phase until the player commits a unit.
  const endTurnDisabled = !gs.orderFixed && !committedId;

  // Auto end turn when unit has used both actions
  const selForAuto = getSel();
  if (selForAuto && committedId && selForAuto.moved && selForAuto.orangeUsed) {
    setTimeout(() => endTurn(), 300);
  }

  return (
    <SafeAreaView style={s.c}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={resetGame}><Text style={s.rst}>Reset</Text></TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.turnT}>Turn {gs.turn}</Text>
          <Badge label={activePlayer === P1 ? 'PLAYER 1 BLUE' : 'PLAYER 2 RED'} color={activePlayer === P1 ? Colors.playerOne : Colors.playerTwo} />
        </View>
        <Button title="End Turn" onPress={endTurn} size="sm" disabled={endTurnDisabled} />
      </View>

      <InitiativeBar gs={gs} units={units} activeUnitId={activeUnitId} hoverUnitId={hoverUnitId} onHoverUnit={setHoverUnitId} />

      <ScrollView
        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}
        style={{ flex: 1 }}
      >
        {/* Fixed-size container — exactly GRID_PX wide so tiles are never stretched */}
        <View style={{ width: GRID_PX, height: GRID_PX * TILT_COS + UNIT_CLIP_H, overflow: 'visible' }}>

          {/* TILE GRID — absolutely positioned squares, tilted with rotateX */}
          <View style={{
            position: 'absolute',
            top: UNIT_CLIP_H,
            left: 0,
            width: GRID_PX,
            height: GRID_PX,
            // @ts-ignore
            transform: [{ rotateX: TILT }],
            transformOrigin: 'top center',
          } as any}>
            {Array.from({ length: BS }).map((_, gy) =>
              Array.from({ length: BS }).map((_, gx) => {
                const tintKey = getTileTint(gx, gy);
                const fill = ISO_FILL[tintKey] ?? ISO_FILL.dark;
                const tileKey = `${gx},${gy}`;
                const isHovered = hoverTile === tileKey;
                const isPressed = pressedTile === tileKey;
                return (
                  <TouchableOpacity
                    key={tileKey}
                    onPress={() => { setPressedTile(tileKey); handleTile(gx, gy); setTimeout(() => setPressedTile(null), 150); }}
                    // @ts-ignore — web mouse events
                    onMouseEnter={() => {
                      setHoverTile(tileKey);
                      const unitOnTile = units.find(u => u.alive && u.pos.x === gx && u.pos.y === gy);
                      setHoverUnitId(unitOnTile?.id ?? null);
                    }}
                    onMouseLeave={() => { setHoverTile(null); setHoverUnitId(null); }}
                    style={{
                      position: 'absolute',
                      left: gx * TILE,
                      top: gy * TILE,
                      width: TILE,
                      height: TILE,
                      backgroundColor: fill,
                      borderWidth: 0.5,
                      borderColor: ISO_EDGE,
                    }}
                  >
                    {/* Hover highlight — subtle brightness lift */}
                    {isHovered && !isPressed && (
                      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' } as any} />
                    )}
                    {/* Initiative-bar hover — highlight the tile of the hovered portrait */}
                    {!isHovered && (() => {
                      const unitHere = hoverUnitId && units.find(u => u.id === hoverUnitId && u.pos.x === gx && u.pos.y === gy);
                      return unitHere ? <View style={{ position: 'absolute', inset: 0, borderWidth: 2, borderColor: '#ffffff88' } as any} /> : null;
                    })()}
                    {/* Press highlight */}
                    {isPressed && (
                      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' } as any} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {/* UNIT LAYER — pointerEvents none so all clicks/hovers go to the tile layer beneath */}
          {units.filter(u => u.alive).map(u => {
            const { sx, sy } = tileScreenPos(u.pos.x, u.pos.y);
            const isUsed = gs.usedThisRound.has(u.id) && u.id !== committedId;
            const isSelected = (u.id === selId || u.id === committedId) && u.owner === gs.active;
            const isFrozen = u.frozenTurns > 0;
            const animPos = getUnitAnimPos(u.id, sx, sy);
            return (
              <Animated.View
                key={u.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: -UNIT_W / 2,
                  top: 0,
                  width: UNIT_W,
                  height: UNIT_CLIP_H,
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  zIndex: u.pos.y * BS + u.pos.x + 1,
                  transform: [
                    { translateX: animPos.x },
                    { translateY: animPos.y },
                  ],
                }}
              >
                {isSelected && !isMoving && !u.orangeUsed && <View style={{ position: 'absolute', bottom: 2, width: TILE * 0.7, height: 8, borderRadius: 999, backgroundColor: '#ffffff22', borderWidth: 2, borderColor: '#ffffffaa' }}/>}
                {isFrozen && <View style={{ position: 'absolute', bottom: 2, width: TILE * 0.7, height: 8, borderRadius: 999, backgroundColor: '#0088ff22', borderWidth: 2, borderColor: '#44aaffcc' }}/>}
                <UnitFigure unitId={u.id} slug={u.slug} owner={u.owner} opacity={isUsed ? 0.45 : 1} cellSize={UNIT_CELL} />
                <View style={{ position: 'absolute', top: 0, left: 4, right: 4, height: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 2 }}>
                  <View style={{ width: ((u.hp / u.maxHp) * 100) + '%', height: '100%', borderRadius: 2, backgroundColor: u.hp / u.maxHp > 0.5 ? '#44dd44' : u.hp / u.maxHp > 0.25 ? '#ddaa00' : '#dd2222' }}/>
                </View>
                {isFrozen && <View style={{ position: 'absolute', top: 6, right: 4 }}><Text style={{ fontSize: 12 }}>❄</Text></View>}
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      <View style={s.panel}>
        {/* Inspect row — shows unit on hovered tile */}
        <View style={s.inspectBox}>
          {(() => {
            let inspected: Unit | null = null;
            if (hoverTile) {
              const [hx, hy] = hoverTile.split(',').map(Number);
              inspected = units.find(u => u.alive && u.pos.x === hx && u.pos.y === hy) ?? null;
            }
            // Also check hoverUnitId — set when hovering initiative portraits
            if (!inspected && hoverUnitId) {
              inspected = units.find(u => u.id === hoverUnitId) ?? null;
            }
            if (!inspected && inspectId) {
              inspected = units.find(u => u.id === inspectId) ?? null;
            }
            if (inspected) return (
              <View><Text style={[s.selName, { color: inspected.owner === P1 ? Colors.playerOne : Colors.playerTwo }]}>
                {inspected.name} {inspected.owner !== activePlayer ? '(Enemy)' : '(Ally)'}  HP {inspected.hp}/{inspected.maxHp}  Dodge {dodgePct(inspected.ac)}%
              </Text><Text style={s.selHp}>
                MV:{inspected.moveRange}  {inspected.basic.name}(rng{inspected.basic.range},{inspected.basic.damage ?? ''}dmg)
                {'  '}{inspected.special.name}★{inspected.specialUsed ? '[used]' : '(rng' + inspected.special.range + ')'}
              </Text></View>
            );
            return <Text style={s.inspectPlaceholder}>Hover over any tile to inspect units</Text>;
          })()}
        </View>

        {/* Selected unit name */}
        <View style={s.selRow}>
          <Text style={s.selName} numberOfLines={1}>
            {sel ? sel.name + '  HP ' + sel.hp + '/' + sel.maxHp + '  Dodge ' + dodgePct(sel.ac) + '%' + (sel.specialUsed ? '  [special used]' : '') : ' '}
          </Text>
        </View>

        {/* Action buttons */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.actionRow}>
          <TouchableOpacity style={[s.actBtn, sel && mode === 'move' && s.actBtnActive, (!sel || sel.moved) && s.actBtnDone]} onPress={() => sel && setMode('move')} disabled={!sel || sel.moved}>
            <Text style={[s.actTxt, (!sel || sel.moved) && s.actTxtDone]}>{sel?.moved ? 'Moved' : 'Move'}</Text>
          </TouchableOpacity>
          {sel ? <>
            <TouchableOpacity style={[s.actBtn, s.ablBtn, mode === 'basic' && s.ablBtnActive, sel.orangeUsed && s.actBtnDone]} onPress={() => !sel.orangeUsed && handleAbilityButton('basic')} disabled={sel.orangeUsed}>
              <Text style={[s.actTxt, sel.orangeUsed && s.actTxtDone]}>{sel.basic.name}</Text>
            </TouchableOpacity>
            {!sel.specialUsed && (
              <TouchableOpacity style={[s.actBtn, s.specBtn, mode === 'special' && s.specBtnActive, sel.orangeUsed && s.actBtnDone]} onPress={() => !sel.orangeUsed && handleAbilityButton('special')} disabled={sel.orangeUsed}>
                <Text style={[s.actTxt, sel.orangeUsed && s.actTxtDone]}>{sel.special.name} ★</Text>
              </TouchableOpacity>
            )}
            {sel.moved && !sel.orangeUsed && !sel.orangeUsed && (
              <TouchableOpacity style={[s.actBtn, s.chargeBtn, mode === 'charge' && s.chargeBtnActive]} onPress={() => handleAbilityButton('charge')}>
                <Text style={s.actTxt}>Charge</Text>
              </TouchableOpacity>
            )}
          </> : <View style={[s.actBtn, s.ablBtn, s.actBtnDone]}><Text style={s.actTxtDone}>—</Text></View>}
        </ScrollView>

        {/* Hint text */}
        <View style={s.hintRow}>
          <Text style={s.hint}>
            {sel && mode === 'move' && !sel.moved ? 'Tap a blue tile to move (no diagonals)' :
             sel && mode === 'charge' ? 'Tap a blue tile to charge' :
             sel && mode === 'move' && sel.moved ? 'Moved. Choose action.' :
             sel && (mode === 'basic' || mode === 'special') && !sel.orangeUsed ? 'Tap a highlighted square' :
             sel && sel.orangeUsed ? 'Done. End turn.' :
             !gs.orderFixed && !committedId ? 'Choose and commit a unit before ending turn' :
             committedId ? 'Select your committed unit' :
             'Tap a ' + (activePlayer === P1 ? 'blue' : 'red') + ' unit (bright ring = available)'}
          </Text>
        </View>

        {/* Scrollable combat log */}
        <ScrollView
          style={s.logScroll}
          contentContainerStyle={{ paddingVertical: 2 }}
          showsVerticalScrollIndicator={false}
        >
          {[...gs.log].reverse().map((entry, i) => (
            <Text key={i} style={s.logL}>{entry}</Text>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.bg },
  setupScroll: { padding: Spacing.lg },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800', textAlign: 'center' },
  sub: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center', marginBottom: Spacing.lg },
  tp: { marginBottom: Spacing.lg },
  tpl: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.sm },
  slotRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  slotN: { color: Colors.textSecondary, fontSize: FontSize.sm, width: 50 },
  chip: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.xs, backgroundColor: Colors.bgCard, alignItems: 'center' },
  chipSel: { borderColor: Colors.primary, backgroundColor: Colors.primary + '33' },
  chipT: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  chipSub: { color: Colors.textMuted, fontSize: 9 },
  chipTS: { color: Colors.primary },
  placeLabel: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm, textAlign: 'center' },
  placeBoard: { alignSelf: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  placeLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.sm, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  legendPlaced: { borderColor: Colors.primary },
  legendNum: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800', marginRight: 4 },
  legendName: { color: Colors.textSecondary, fontSize: FontSize.xs },
  legendPos: { color: Colors.textMuted, fontSize: FontSize.xs },
  // Initiative bar
  initBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 4, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  initLabel: { color: Colors.textMuted, fontSize: 10, marginRight: Spacing.xs },
  initScroll: { flex: 1 },
  initSlot: { width: BUST_SLOT_W, minHeight: BUST_SLOT_H + 16, borderRadius: 8, backgroundColor: Colors.bgCard, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 6, paddingBottom: 2, overflow: 'hidden' },
  initSlotActive: { borderColor: '#ffffff' },
  initSlotHighlighted: { borderColor: '#aaccff' },
  initSlotUsed: { opacity: 0.4 },
  initSlotDead: { borderColor: Colors.danger },
  initSlotEmpty: { borderStyle: 'dashed' },
  initName: { fontSize: 14, fontWeight: '800' },
  initHp: { fontSize: 8, color: Colors.textMuted },
  initQ: { color: Colors.textMuted, fontSize: 16 },
  // Game board — isometric tiles are rendered inline via IsoTile, not via StyleSheet
  // These styles are still used by PlacementBoard on the setup screens:
  row: { flexDirection: 'row' },
  tile: { width: TS, height: TS, alignItems: 'center', justifyContent: 'center' },
  tL: { backgroundColor: '#1a1a2e' },
  tD: { backgroundColor: '#16213e' },
  tSel: { backgroundColor: Colors.primary + '33', borderWidth: 2, borderColor: '#ffffff' },
  tMove: { backgroundColor: '#3355ff55' },
  tDisabled: { backgroundColor: '#0a0a14' },
  uMark: { width: TS - 4, height: TS - 4, borderRadius: 6, alignItems: 'center', justifyContent: 'center', padding: 2 },
  uLbl: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  uNum: { color: Colors.textPrimary, fontSize: 9, fontWeight: '600' },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  rst: { color: Colors.danger, fontSize: FontSize.sm },
  turnT: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  // Panel
  panel: { backgroundColor: Colors.bgCard, borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.sm },
  inspectBox: { height: 36, justifyContent: 'center', marginBottom: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm },
  inspectPlaceholder: { color: Colors.textMuted, fontSize: FontSize.xs, fontStyle: 'italic' },
  selRow: { height: 20, justifyContent: 'center', marginBottom: 4 },
  selName: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  selHp: { color: Colors.textSecondary, fontSize: FontSize.xs },
  actionRow: { height: 34, marginBottom: 4 },
  actBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primary + '22', marginRight: Spacing.sm, alignItems: 'center' },
  ablBtn: { borderColor: Colors.warning, backgroundColor: Colors.warning + '22' },
  specBtn: { borderColor: '#ff44ff', backgroundColor: '#ff44ff22' },
  chargeBtn: { borderColor: '#ff8800', backgroundColor: '#ff880022' },
  actBtnActive: { borderWidth: 2, borderColor: Colors.textPrimary, backgroundColor: Colors.primary + '55' },
  ablBtnActive: { borderWidth: 2, borderColor: Colors.textPrimary, backgroundColor: Colors.warning + '55' },
  specBtnActive: { borderWidth: 2, borderColor: Colors.textPrimary, backgroundColor: '#ff44ff55' },
  chargeBtnActive: { borderWidth: 2, borderColor: Colors.textPrimary, backgroundColor: '#ff880055' },
  actBtnDone: { opacity: 0.35 },
  actTxt: { color: Colors.textPrimary, fontSize: FontSize.xs, fontWeight: '600' },
  actTxtDone: { color: Colors.textMuted },
  hintRow: { paddingVertical: 2 },
  hint: { color: Colors.textMuted, fontSize: FontSize.xs },
  logScroll: { maxHeight: 56 },
  logL: { color: Colors.textSecondary, fontSize: FontSize.xs },
});
