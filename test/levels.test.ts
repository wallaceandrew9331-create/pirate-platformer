import { describe, expect, it } from 'vitest';
import { TILE } from '../src/game/constants.ts';
import { LEVEL_DEFS, LEVELS } from '../src/game/levels/index.ts';
import { parseLevel } from '../src/game/level.ts';
import { solve } from '../src/game/solver.ts';
import { isSolid, tileAt, T } from '../src/game/tiles.ts';
import { createWorld, step } from '../src/game/world.ts';

describe('level data', () => {
  it('has three levels with distinct settings', () => {
    expect(LEVELS).toHaveLength(3);
    expect(new Set(LEVELS.map((l) => l.def.theme)).size).toBe(3);
  });

  it.each(LEVEL_DEFS)('$name has rectangular rows and parses', (def) => {
    const w = def.rows[0]!.length;
    for (const r of def.rows) expect(r.length).toBe(w);
    expect(() => parseLevel(def)).not.toThrow();
  });

  it('features all four enemy types across the game, plus a boss at the end', () => {
    const kinds = new Set(LEVELS.flatMap((l) => l.spawns.map((s) => s.kind)));
    for (const k of ['deckhand', 'parrot', 'cannon', 'brute'] as const) expect(kinds).toContain(k);
    expect(LEVELS[2]!.spawns.filter((s) => s.kind === 'boss')).toHaveLength(1);
    expect(LEVELS[2]!.gateX).not.toBeNull();
  });

  it.each(LEVELS)('$def.name: start, goal and checkpoints stand on solid ground', (level) => {
    const g = { w: level.w, h: level.h, tiles: level.tiles };
    const standable = (x: number, y: number): boolean => {
      const code = tileAt(g, Math.floor(x / TILE), Math.floor(y / TILE));
      return isSolid(code) || code === T.OneWay;
    };
    expect(standable(level.start.x + 5, level.start.y + 1)).toBe(true);
    expect(standable(level.goal.x + 12, level.goal.y + level.goal.h + 1)).toBe(true);
    for (const cp of level.checkpoints) expect(standable(cp.x + 8, cp.y + TILE + 1)).toBe(true);
    expect(level.checkpoints.length).toBeGreaterThanOrEqual(1);
  });

  it.each(LEVELS)('$def.name: walkers and cannons spawn on the ground, not in walls', (level) => {
    const g = { w: level.w, h: level.h, tiles: level.tiles };
    for (const s of level.spawns) {
      if (s.kind === 'parrot') continue;
      const tx = Math.floor(s.x / TILE);
      const ty = Math.floor(s.y / TILE);
      expect(tileAt(g, tx, ty - 1), `${s.kind} at ${tx},${ty - 1}`).toBe(T.Empty);
      expect(isSolid(tileAt(g, tx, ty)), `${s.kind} floor at ${tx},${ty}`).toBe(true);
    }
  });

  it('the sim is deterministic: the same inputs give the same world', () => {
    const level = LEVELS[0]!;
    const a = createWorld(level);
    const b = createWorld(level);
    for (let i = 0; i < 600; i++) {
      const inp = { left: false, right: i % 90 < 70, jump: i % 37 < 12, slash: i % 23 === 0, parry: i % 41 === 0 };
      step(a, level, inp);
      step(b, level, inp);
    }
    expect(JSON.stringify({ ...a, events: [] })).toBe(JSON.stringify({ ...b, events: [] }));
  });
});

// The strongest level test: a beam-search player must finish each level
// through the real physics and enemies. A narrow beam keeps it fast; the
// full-width search lives in `npm run solve`.
describe('every level can be finished', () => {
  it.each(LEVELS)(
    '$def.name is beatable',
    (level) => {
      const r = solve(level, { beam: 50 });
      expect(r.won, `stuck at x=${Math.round(r.bestX)} of ${level.w * TILE}`).toBe(true);
      // Replaying the recorded inputs must reproduce the win (determinism).
      const w = createWorld(level);
      for (const inp of r.inputs) step(w, level, inp);
      expect(w.status).toBe('won');
      if (level.gateX !== null) expect(w.boss).toBe('defeated');
    },
    120_000,
  );
});
