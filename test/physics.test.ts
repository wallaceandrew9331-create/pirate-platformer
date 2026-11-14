import { describe, expect, it } from 'vitest';
import { DT, PLAYER, TILE } from '../src/game/constants.ts';
import { moveBody, overlaps, type Body } from '../src/game/physics.ts';
import { stepPlayer, createPlayer } from '../src/game/player.ts';
import { T, type Grid } from '../src/game/tiles.ts';
import { NO_INPUT } from '../src/game/types.ts';
import { flat, makeWorld, press, run, runUntil, seconds } from './helpers.ts';

function grid(rows: string[]): Grid {
  const h = rows.length;
  const w = rows[0]!.length;
  const tiles = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => (tiles[y * w + x] = ch === '#' ? T.Solid : ch === '=' ? T.OneWay : T.Empty)));
  return { w, h, tiles };
}

const body = (x: number, y: number, vx = 0, vy = 0): Body => ({ x, y, w: 10, h: 14, vx, vy });

describe('moveBody', () => {
  const g = grid(['..........', '..........', '.....#....', '..........', '##########']);

  it('lands flush on the floor and reports it', () => {
    const b = body(10, 64 - 14 - 2, 0, 300);
    const r = moveBody(g, b, DT);
    expect(r.landed).toBe(true);
    expect(b.y + b.h).toBe(64);
    expect(b.vy).toBe(0);
  });

  it('stops flush against a wall', () => {
    const b = body(80 - 10 - 1, 34, 200, 0);
    const r = moveBody(g, b, DT);
    expect(r.hitWall).toBe(true);
    expect(b.x + b.w).toBe(80);
  });

  it('bumps its head on a ceiling', () => {
    const b = body(82, 50, 0, -300);
    const r = moveBody(g, b, DT);
    expect(r.hitCeiling).toBe(true);
    expect(b.y).toBe(48);
    expect(r.ceilingTile).toEqual({ tx: 5, ty: 2 });
  });

  it('treats the side edges of the level as walls but the bottom as a pit', () => {
    const b = body(1, 30, -300, 0);
    moveBody(g, b, DT);
    expect(b.x).toBe(0);
    const open = grid(['....', '....']);
    const f = body(0, 20, 0, 300);
    expect(moveBody(open, f, DT).landed).toBe(false);
  });

  it('never tunnels through a one-tile floor at max fall speed', () => {
    const thin = grid(['....', '....', '....', '####', '....']);
    const b = body(2, 0, 0, PLAYER.maxFall);
    for (let i = 0; i < 60; i++) moveBody(thin, b, DT);
    expect(b.y + b.h).toBe(3 * TILE);
  });
});

describe('one-way platforms', () => {
  const g = grid(['......', '......', '..==..', '......', '......', '######']);

  it('catch a body falling from above', () => {
    const b = body(34, 32 - 14 - 3, 0, 200);
    expect(moveBody(g, b, DT).landed).toBe(true);
    expect(b.y + b.h).toBe(32);
  });

  it('let a body jump up through them', () => {
    const b = body(34, 50, 0, -300);
    const r = moveBody(g, b, DT);
    expect(r.hitCeiling).toBe(false);
    expect(b.y).toBeLessThan(50);
  });

  it('do not catch a body whose feet started below the top', () => {
    const b = body(34, 32 - 10, 0, 100); // feet already 4 px into the plank
    expect(moveBody(g, b, DT).landed).toBe(false);
  });
});

describe('player controller', () => {
  it('accelerates to max run speed and no faster', () => {
    const { level, world } = makeWorld(flat());
    run(level, world, 60, { right: true });
    expect(world.player.vx).toBeCloseTo(PLAYER.maxSpeed);
    expect(world.player.facing).toBe(1);
  });

  it('holding jump goes higher than tapping it (variable jump height)', () => {
    const peak = (holdFrames: number): number => {
      const { level, world } = makeWorld(flat());
      run(level, world, 10);
      const ground = world.player.y;
      let top = ground;
      for (let i = 0; i < 90; i++) {
        run(level, world, 1, { jump: i < holdFrames });
        top = Math.min(top, world.player.y);
      }
      return ground - top;
    };
    const tap = peak(3);
    const held = peak(60);
    expect(held).toBeGreaterThan(tap * 2);
    // A full jump clears three tiles but not four.
    expect(held).toBeGreaterThan(3 * TILE);
    expect(held).toBeLessThan(4 * TILE);
  });

  it('allows a jump shortly after running off a ledge (coyote time)', () => {
    const rows = ['....................', '....................', '.P..................', '#####..............G', '####################'];
    const { level, world } = makeWorld(rows);
    run(level, world, 3); // settle onto the ledge first
    runUntil(level, world, (w) => !w.player.onGround, { right: true });
    run(level, world, 3, { right: true }); // 3 frames of air: inside the 6-frame window
    const vyBefore = world.player.vy;
    run(level, world, 1, { right: true, jump: true });
    expect(vyBefore).toBeGreaterThanOrEqual(0);
    expect(world.player.vy).toBeLessThan(-PLAYER.jumpSpeed * 0.9);
  });

  it('does not allow a jump long after leaving the ledge', () => {
    const rows = ['....................', '....................', '.P..................', '#####..............G', '#####...............', '....................'];
    const { level, world } = makeWorld(rows);
    run(level, world, 3); // settle onto the ledge first
    runUntil(level, world, (w) => !w.player.onGround, { right: true });
    run(level, world, seconds(PLAYER.coyoteTime) + 3, { right: true });
    run(level, world, 1, { right: true, jump: true });
    expect(world.player.vy).toBeGreaterThan(0);
  });

  it('buffers a jump pressed just before landing', () => {
    const { level, world } = makeWorld(flat());
    run(level, world, 5);
    run(level, world, 1, { jump: true });
    run(level, world, 30, { jump: true });
    // falling now; release, then press a few frames before touching down
    runUntil(level, world, (w) => w.player.vy > 0 && w.player.y + w.player.h > 128 - 10);
    run(level, world, 1, { jump: true });
    runUntil(level, world, (w) => w.player.vy < -100, { jump: true }, 12);
    expect(world.player.vy).toBeLessThan(-100);
  });

  it('bounces high off a spring barrel', () => {
    const rows = ['....', '....', '....', '....', '....', '....', '.P..', '.J.G', '####'];
    const { level, world } = makeWorld(rows);
    world.player.x = 18;
    const r = runUntil(level, world, (w) => w.events.some((e) => e.type === 'spring'));
    expect(r).toBeLessThan(60);
    expect(world.player.vy).toBe(-PLAYER.springSpeed);
  });

  it('cannot start a slash and a parry at the same time', () => {
    const p = createPlayer(0, 100);
    const g = grid(['....', '....', '....', '....', '....', '....', '....', '####']);
    stepPlayer(p, g, press({ slash: true, parry: true }), DT, []);
    expect(p.slashT >= 0 && p.parryT >= 0).toBe(false);
    stepPlayer(p, g, NO_INPUT, DT, []);
  });
});

describe('overlaps', () => {
  it('is exclusive at touching edges', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9.9, y: 9.9, w: 5, h: 5 })).toBe(true);
  });
});
