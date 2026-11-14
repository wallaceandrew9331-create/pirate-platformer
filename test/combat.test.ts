import { describe, expect, it } from 'vitest';
import { contactHurts, isBehind, reflectedBallOutcome, slashOutcome, stompOutcome } from '../src/game/combat.ts';
import { BOSS, BRUTE, CANNON, COINS_PER_LIFE, PLAYER, TILE } from '../src/game/constants.ts';
import { createEnemy } from '../src/game/enemies.ts';
import { tileAt, T } from '../src/game/tiles.ts';
import type { Enemy, World } from '../src/game/types.ts';
import { flat, makeWorld, run, runUntil } from './helpers.ts';

const only = (w: World, kind: Enemy['kind']): Enemy | undefined => w.enemies.find((e) => e.kind === kind);
const has = (w: World, type: string): boolean => w.events.some((e) => e.type === type);

/** Puts the player just left of (or right of) an enemy, standing, facing it. */
function faceOff(w: World, e: Enemy, side: -1 | 1, gap = 4): void {
  const p = w.player;
  p.x = side < 0 ? e.x - p.w - gap : e.x + e.w + gap;
  p.facing = side < 0 ? 1 : -1;
  p.vx = 0;
}

describe('deckhand', () => {
  it('dies to a slash', () => {
    const { level, world } = makeWorld(flat('d', 8));
    const d = only(world, 'deckhand')!;
    faceOff(world, d, -1);
    run(level, world, 1, { slash: true });
    run(level, world, 6);
    expect(only(world, 'deckhand')).toBeUndefined();
    expect(world.score).toBe(100);
  });

  it('dies to a stomp, and the stomp bounces you', () => {
    const { level, world } = makeWorld(flat('d', 8));
    const d = only(world, 'deckhand')!;
    d.vx = 0;
    world.player.x = d.x + 1;
    world.player.y = d.y - 30;
    world.player.vy = 100;
    runUntil(level, world, (w) => has(w, 'stomp'), {}, 60);
    expect(only(world, 'deckhand')).toBeUndefined();
    expect(world.player.vy).toBeLessThan(-200);
    expect(world.player.hearts).toBe(PLAYER.maxHearts);
  });

  it('hurts on contact, then grants a moment of invulnerability', () => {
    const { level, world } = makeWorld(flat('d', 4));
    runUntil(level, world, (w) => has(w, 'hurt'), { right: true }, 120);
    expect(world.player.hearts).toBe(PLAYER.maxHearts - 1);
    run(level, world, 20, { right: true });
    expect(world.player.hearts).toBe(PLAYER.maxHearts - 1);
  });
});

describe('parrot', () => {
  it('cannot be stomped: landing on it hurts', () => {
    const e = createEnemy({ kind: 'parrot', x: 100, y: 100, dir: -1 }, 1);
    expect(stompOutcome(e)).toBe('hurt');
    expect(contactHurts(e)).toBe(true);
  });

  it('is batted away by a slash, not killed', () => {
    const { level, world } = makeWorld(flat('p', 8));
    const p = only(world, 'parrot')!;
    world.player.x = p.x - world.player.w - 4;
    world.player.y = p.y - 2;
    world.player.vy = 0;
    run(level, world, 1, { slash: true });
    run(level, world, 4);
    expect(p.state).toBe('flee');
    expect(world.enemies).toContain(p);
    expect(contactHurts(p)).toBe(false);
  });

  it('dives toward where the player was when it locked on', () => {
    const { level, world } = makeWorld(flat('p', 10));
    const p = only(world, 'parrot')!;
    runUntil(level, world, () => p.state === 'aim', { right: true }, 120);
    runUntil(level, world, () => p.state === 'dive', {}, 60);
    expect(p.vy).toBeGreaterThan(0);
    expect(Math.sign(p.vx)).toBe(Math.sign(p.targetX - (p.x + p.w / 2)) || Math.sign(p.vx));
  });
});

describe('cannon', () => {
  it('shrugs off a sword: the blade clangs and knocks you back', () => {
    const { level, world } = makeWorld(flat('<', 12));
    const c = only(world, 'cannon')!;
    faceOff(world, c, -1);
    run(level, world, 1, { slash: true });
    runUntil(level, world, (w) => has(w, 'clang'), {}, 10);
    expect(world.enemies).toContain(c);
    expect(world.player.vx).toBeLessThan(0);
  });

  it('fires when you are in range, and the ball hurts if not parried', () => {
    const { level, world } = makeWorld(flat('<', 12));
    runUntil(level, world, (w) => has(w, 'fire'), {}, 120);
    runUntil(level, world, (w) => has(w, 'hurt'), {}, 300);
    expect(world.player.hearts).toBe(PLAYER.maxHearts - 1);
  });

  it('is destroyed by its own ball, parried back', () => {
    const { level, world } = makeWorld(flat('<', 12));
    const p = world.player;
    runUntil(level, world, (w) => w.balls.length > 0 && w.balls[0]!.x < p.x + p.w + 6, {}, 400);
    run(level, world, 1, { parry: true });
    runUntil(level, world, (w) => has(w, 'reflect'), { parry: true }, 15);
    expect(world.balls[0]!.owner).toBe('player');
    expect(world.balls[0]!.vx).toBeGreaterThan(CANNON.ballSpeed);
    runUntil(level, world, (w) => !only(w, 'cannon'), {}, 200);
    expect(world.player.hearts).toBe(PLAYER.maxHearts);
    expect(world.score).toBe(200);
  });

  it('a parry facing the wrong way does not deflect', () => {
    const { level, world } = makeWorld(flat('<', 12));
    const p = world.player;
    runUntil(level, world, (w) => w.balls.length > 0 && w.balls[0]!.x < p.x + p.w + 6, {}, 400);
    p.facing = -1;
    run(level, world, 1, { parry: true });
    run(level, world, 10, { parry: true });
    expect(world.player.hearts).toBe(PLAYER.maxHearts - 1);
  });
});

describe('brute', () => {
  it('blocks a slash from the front', () => {
    const { level, world } = makeWorld(flat('b', 10));
    const b = only(world, 'brute')!;
    expect(b.dir).toBe(-1);
    faceOff(world, b, -1, 2);
    run(level, world, 1, { slash: true });
    runUntil(level, world, (w) => has(w, 'clang'), {}, 10);
    expect(world.enemies).toContain(b);
  });

  it('falls to one slash from behind', () => {
    const { level, world } = makeWorld(flat('b', 10));
    const b = only(world, 'brute')!;
    faceOff(world, b, 1, 2);
    expect(isBehind(b, world.player)).toBe(true);
    run(level, world, 1, { slash: true });
    run(level, world, 8);
    expect(only(world, 'brute')).toBeUndefined();
    expect(world.score).toBe(300);
  });

  it('turns round if you linger behind it', () => {
    const { level, world } = makeWorld(flat('b', 10));
    const b = only(world, 'brute')!;
    faceOff(world, b, 1, 20);
    run(level, world, 60);
    expect(b.dir).toBe(1);
  });

  it('is stunned by a parried swing, then one slash finishes it', () => {
    const { level, world } = makeWorld(flat('b', 10));
    const b = only(world, 'brute')!;
    faceOff(world, b, -1, 8);
    runUntil(level, world, () => b.state === 'windup' && b.t > BRUTE.windup - 0.08, {}, 120);
    run(level, world, 1, { parry: true });
    runUntil(level, world, () => b.state === 'stunned', { parry: true }, 20);
    expect(world.player.hearts).toBe(PLAYER.maxHearts);
    run(level, world, 2);
    run(level, world, 1, { slash: true });
    run(level, world, 8);
    expect(only(world, 'brute')).toBeUndefined();
  });

  it('hits you if you do nothing', () => {
    const { level, world } = makeWorld(flat('b', 10));
    const b = only(world, 'brute')!;
    faceOff(world, b, -1, 8);
    runUntil(level, world, (w) => has(w, 'hurt'), {}, 120);
    expect(world.player.hearts).toBe(PLAYER.maxHearts - 1);
  });

  it('a stomp only bounces off its helmet', () => {
    const b = createEnemy({ kind: 'brute', x: 0, y: 0, dir: 1 }, 1);
    expect(stompOutcome(b)).toBe('bounce');
    b.state = 'stunned';
    expect(contactHurts(b)).toBe(false);
  });
});

describe('boss arena', () => {
  const arena = (): string[] => {
    const W = 36;
    const rows = Array.from({ length: 10 }, () => '.'.repeat(W - 1) + '#');
    rows[7] = '.P......|................X....G...#';
    rows[8] = '#'.repeat(W);
    rows[9] = '#'.repeat(W);
    return rows;
  };

  it('locks the gate when you enter, and keeps the goal shut until the boss falls', () => {
    const { level, world } = makeWorld(arena());
    expect(world.goalOpen).toBe(false);
    runUntil(level, world, (w) => w.boss === 'fighting', { right: true }, 200);
    expect(tileAt(world.grid, 8, 7)).toBe(T.Gate);
    const boss = only(world, 'boss')!;
    while (only(world, 'boss')) {
      boss.state = 'stunned';
      boss.t = 0;
      boss.aux = 0;
      boss.count = 0;
      world.balls.push({ x: boss.x - 8, y: boss.y + 10, w: 6, h: 6, vx: 200, vy: 0, owner: 'player', alive: true });
      run(level, world, 3);
    }
    expect(world.boss).toBe('defeated');
    expect(world.goalOpen).toBe(true);
    expect(tileAt(world.grid, 8, 7)).toBe(T.Empty);
  });

  it('takes at most two sword hits per stun', () => {
    const { level, world } = makeWorld(arena());
    runUntil(level, world, (w) => w.boss === 'fighting', { right: true }, 200);
    const boss = only(world, 'boss')!;
    boss.state = 'stunned';
    boss.t = 0;
    boss.count = 0;
    for (let i = 0; i < 4; i++) {
      boss.aux = 0;
      expect(slashOutcome(boss, world.player)).toBe(i < 2 ? 'damage' : 'blocked');
      if (i < 2) {
        boss.hp -= 0; // apply via the real path below
        world.player.x = boss.x - world.player.w - 2;
        world.player.facing = 1;
        world.player.slashCd = 0;
        run(level, world, 1, { slash: true });
        run(level, world, 4);
      }
    }
    expect(boss.hp).toBe(BOSS.hp - 2);
    expect(boss.state).not.toBe('stunned');
  });

  it('a reflected ball always hurts it unless just hit', () => {
    const boss = createEnemy({ kind: 'boss', x: 0, y: 0, dir: -1 }, 1);
    boss.state = 'idle';
    expect(reflectedBallOutcome(boss)).toBe('damage');
    boss.aux = 0.2;
    expect(reflectedBallOutcome(boss)).toBe('none');
  });
});

describe('lives, checkpoints, pickups', () => {
  const pit = (): string[] => {
    const rows = Array.from({ length: 10 }, () => '.'.repeat(30));
    rows[7] = '.P...C.......................G';
    rows[8] = '##########....################';
    rows[9] = '##########....################';
    return rows;
  };

  it('falling in a pit costs a life and respawns you at the last checkpoint', () => {
    const { level, world } = makeWorld(pit());
    runUntil(level, world, (w) => w.status === 'dying', { right: true }, 400);
    expect(world.checkpoints[0]!.active).toBe(true);
    runUntil(level, world, (w) => w.status === 'playing', {}, 200);
    expect(world.lives).toBe(2);
    expect(world.player.x).toBe(5 * TILE + 3);
    expect(world.player.hearts).toBe(PLAYER.maxHearts);
  });

  it('runs out of lives into game over', () => {
    const { level, world } = makeWorld(pit());
    for (let i = 0; i < 3; i++) {
      runUntil(level, world, (w) => w.status !== 'playing', { right: true }, 600);
      runUntil(level, world, (w) => w.status !== 'dying', {}, 200);
    }
    expect(world.status).toBe('gameover');
    expect(world.lives).toBe(0);
  });

  it('every hundred doubloons is an extra life', () => {
    const rows = flat('o', 3);
    const { level, world } = makeWorld(rows);
    world.doubloons = COINS_PER_LIFE - 1;
    runUntil(level, world, (w) => has(w, 'oneUp'), { right: true }, 60);
    expect(world.lives).toBe(4);
    expect(world.doubloons).toBe(0);
  });

  it('slashing a crate opens it for three doubloons', () => {
    const { level, world } = makeWorld(flat('x', 4));
    world.player.x = 4 * TILE - world.player.w - 2;
    run(level, world, 1, { slash: true });
    run(level, world, 6);
    expect(tileAt(world.grid, 4, 7)).toBe(T.Empty);
    expect(world.doubloons).toBe(3);
  });

  it('reaching the goal ends the level with a tally', () => {
    const { level, world } = makeWorld(flat());
    runUntil(level, world, (w) => w.status === 'won', { right: true }, 900);
    expect(world.tally!.heartBonus).toBe(PLAYER.maxHearts * 250);
    expect(world.tally!.timeBonus).toBeGreaterThan(0);
  });
});
