// The level simulation: one call to step() advances everything by one fixed
// tick. Pure and deterministic (no clock, no randomness, no DOM), so tests
// and the level solver can run it headless in Node.
import { addCoins, breakCrate, closeGate, damageBoss, hurtPlayer, killEnemy, killPlayer, openGate, repelParrot } from './actions.ts';
import {
  ballVsPlayer,
  contactHurts,
  isStomp,
  reflectedBallOutcome,
  slashActive,
  slashBox,
  slashOutcome,
  stompOutcome,
} from './combat.ts';
import { DEATH_PAUSE, DT, PARRY, PLAYER, SCORE, SLASH, START_LIVES, TILE } from './constants.ts';
import { createEnemy, stepEnemy } from './enemies.ts';
import type { Level } from './level.ts';
import { centerX, centerY, overlaps, touchesTile, type Box } from './physics.ts';
import { createPlayer, stepPlayer } from './player.ts';
import { isSolid, T, tileAt, toTile } from './tiles.ts';
import type { Carry, Input, World } from './types.ts';

export function createWorld(level: Level, carry: Carry = { lives: START_LIVES, score: 0, doubloons: 0 }): World {
  const w: World = {
    levelId: level.def.id,
    tick: 0,
    time: 0,
    grid: { w: level.w, h: level.h, tiles: level.tiles.slice() },
    player: createPlayer(level.start.x, level.start.y),
    enemies: [],
    balls: [],
    coins: level.coins.map((c) => ({ ...c, taken: false })),
    checkpoints: level.checkpoints.map((c) => ({ ...c, active: false })),
    respawn: { ...level.start },
    goal: { ...level.goal },
    goalOpen: true,
    boss: 'none',
    status: 'playing',
    statusT: 0,
    lives: carry.lives,
    score: carry.score,
    doubloons: carry.doubloons,
    defeated: 0,
    deaths: 0,
    nextId: 1,
    tally: null,
    events: [],
  };
  for (const s of level.spawns) {
    w.enemies.push(createEnemy(s, w.nextId++));
    if (s.kind === 'boss') {
      w.boss = 'waiting';
      w.goalOpen = false;
    }
  }
  return w;
}

export function carryFrom(w: World): Carry {
  return { lives: w.lives, score: w.score, doubloons: w.doubloons };
}

/** Advance the world by one fixed tick (1/60 s). */
export function step(w: World, level: Level, input: Input): void {
  w.events = [];
  w.tick += 1;
  if (w.status === 'dying') {
    w.statusT += DT;
    if (w.statusT >= DEATH_PAUSE) afterDeath(w, level);
    return;
  }
  if (w.status !== 'playing') {
    w.statusT += DT;
    return;
  }
  w.time += DT;

  const p = w.player;
  const prevBottom = p.y + p.h;
  const move = stepPlayer(p, w.grid, input, DT, w.events);
  if (move.ceilingTile) breakCrate(w, move.ceilingTile.tx, move.ceilingTile.ty);

  for (const e of [...w.enemies]) stepEnemy(w, e, DT);
  stepBalls(w);
  resolveSlash(w);
  resolveContacts(w, prevBottom);
  if (w.status !== 'playing') return;
  collect(w);
  hazards(w);
  bossArena(w, level);
  if (w.status === 'playing' && w.goalOpen && overlaps(p, w.goal)) finish(w, level);
}

// ---------- combat ----------

function resolveSlash(w: World): void {
  const p = w.player;
  if (!slashActive(p)) return;
  const box = slashBox(p);
  for (const e of [...w.enemies]) {
    if (p.slashHits.includes(e.id) || !overlaps(box, e)) continue;
    p.slashHits.push(e.id);
    switch (slashOutcome(e, p)) {
      case 'kill':
        killEnemy(w, e);
        break;
      case 'damage':
        damageBoss(w, e);
        break;
      case 'repel':
        repelParrot(w, e);
        break;
      case 'blocked':
        // Knocked back off the shield or the cannon's barrel.
        p.vx = -p.facing * SLASH.clangKnock;
        w.events.push({ type: 'clang', x: p.facing > 0 ? box.x + box.w - 4 : box.x + 4, y: centerY(p), kind: e.kind });
        break;
      case 'none':
        break;
    }
  }
  // Crates in reach break open.
  const ty0 = toTile(box.y);
  const ty1 = toTile(box.y + box.h - 1);
  const tx0 = toTile(box.x);
  const tx1 = toTile(box.x + box.w - 1);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) breakCrate(w, tx, ty);
}

function resolveContacts(w: World, prevBottom: number): void {
  const p = w.player;
  for (const e of [...w.enemies]) {
    if (!overlaps(p, e)) continue;
    if (isStomp(p, e, prevBottom)) {
      const outcome = stompOutcome(e);
      if (outcome !== 'hurt') {
        p.vy = -(p.prev.jump ? PLAYER.stompBounceHeld : PLAYER.stompBounce);
        p.y = Math.min(p.y, e.y - p.h);
        p.jumping = p.prev.jump;
        if (outcome === 'kill') {
          killEnemy(w, e);
          w.events.push({ type: 'stomp', x: centerX(e), y: e.y });
        } else w.events.push({ type: 'bounce', x: centerX(p), y: p.y + p.h });
        continue;
      }
    }
    if (contactHurts(e)) hurtPlayer(w, centerX(e));
    if (w.status !== 'playing') return;
  }
}

function stepBalls(w: World): void {
  const p = w.player;
  for (const b of w.balls) {
    if (!b.alive) continue;
    b.x += b.vx * DT;
    const cx = centerX(b);
    const cy = centerY(b);
    const tile = tileAt(w.grid, toTile(cx), toTile(cy));
    if (isSolid(tile)) {
      if (tile === T.Crate && b.owner === 'player') breakCrate(w, toTile(cx), toTile(cy));
      b.alive = false;
      w.events.push({ type: 'ballHit', x: cx, y: cy });
      continue;
    }
    if (Math.abs(cx - centerX(p)) > 420) {
      b.alive = false;
      continue;
    }
    if (b.owner === 'enemy') {
      if (overlaps(b, p) && w.status === 'playing') {
        if (ballVsPlayer(p, b) === 'reflect') {
          b.owner = 'player';
          b.vx = -b.vx * PARRY.reflectSpeedScale;
          p.parryCd = 0;
          p.parryT = -1;
          w.events.push({ type: 'reflect', x: cx, y: cy });
        } else {
          b.alive = false;
          hurtPlayer(w, cx);
          w.events.push({ type: 'ballHit', x: cx, y: cy });
        }
      }
    } else {
      for (const e of [...w.enemies]) {
        if (!overlaps(b, e)) continue;
        const outcome = reflectedBallOutcome(e);
        if (outcome === 'kill') killEnemy(w, e);
        else if (outcome === 'damage') damageBoss(w, e);
        else if (outcome === 'repel') repelParrot(w, e);
        b.alive = false;
        w.events.push({ type: 'ballHit', x: cx, y: cy });
        break;
      }
    }
  }
  w.balls = w.balls.filter((b) => b.alive);
}

// ---------- pickups, hazards, goal ----------

function collect(w: World): void {
  const p = w.player;
  for (const c of w.coins) {
    if (c.taken) continue;
    if (overlaps(p, { x: c.x, y: c.y, w: 8, h: 8 })) {
      c.taken = true;
      addCoins(w, 1, c.x + 4, c.y + 4);
    }
  }
  for (const cp of w.checkpoints) {
    if (cp.active) continue;
    if (overlaps(p, { x: cp.x, y: cp.y - TILE, w: TILE, h: TILE * 2 })) {
      for (const other of w.checkpoints) other.active = false;
      cp.active = true;
      w.respawn = { x: cp.x + 3, y: cp.y + TILE };
      w.events.push({ type: 'checkpoint', x: cp.x + 8, y: cp.y });
    }
  }
}

function hazards(w: World): void {
  const p = w.player;
  if (p.y > w.grid.h * TILE + 24) return killPlayer(w);
  if (touchesTile(w.grid, p, T.Water, 5)) return killPlayer(w);
  // Spikes fill the lower half of their tile.
  const feet: Box = { x: p.x + 2, y: p.y + p.h - 6, w: p.w - 4, h: 6 };
  if (onSpike(w, feet)) {
    hurtPlayer(w, centerX(p) - p.facing);
    if (w.status === 'playing') p.vy = -PLAYER.hurtKnockY * 1.3;
  }
}

function onSpike(w: World, feet: Box): boolean {
  if (!touchesTile(w.grid, feet, T.Spike)) return false;
  const ty = toTile(feet.y + feet.h - 1);
  return feet.y + feet.h > ty * TILE + TILE / 2;
}

function finish(w: World, level: Level): void {
  const p = w.player;
  const timeBonus = Math.max(0, Math.ceil(level.def.par - w.time)) * SCORE.timeBonusPerSec;
  const heartBonus = p.hearts * SCORE.heartBonus;
  w.tally = { time: w.time, timeBonus, heartBonus, goalBonus: SCORE.goal };
  w.score += timeBonus + heartBonus + SCORE.goal;
  w.status = 'won';
  w.statusT = 0;
  w.balls = [];
  w.events.push({ type: 'goal', x: centerX(p), y: centerY(p) });
}

// ---------- boss arena ----------

function bossArena(w: World, level: Level): void {
  if (w.boss !== 'waiting' || level.gateX === null) return;
  if (w.player.x > level.gateX + TILE * 1.5) {
    w.boss = 'fighting';
    closeGate(w, level.gateX);
    const boss = w.enemies.find((e) => e.kind === 'boss');
    if (boss) {
      boss.state = 'idle';
      boss.t = 0;
    }
    w.events.push({ type: 'bossStart', x: centerX(w.player), y: centerY(w.player) });
  }
}

// ---------- death and respawn ----------

function afterDeath(w: World, level: Level): void {
  w.lives -= 1;
  if (w.lives <= 0) {
    w.lives = 0;
    w.status = 'gameover';
    w.statusT = 0;
    w.events.push({ type: 'gameOver', x: centerX(w.player), y: centerY(w.player) });
    return;
  }
  const p = createPlayer(w.respawn.x, w.respawn.y);
  p.invuln = PLAYER.respawnInvuln;
  w.player = p;
  w.balls = [];
  if (w.boss === 'fighting') resetBoss(w, level);
  w.status = 'playing';
  w.statusT = 0;
  w.events.push({ type: 'respawn', x: centerX(p), y: centerY(p) });
}

function resetBoss(w: World, level: Level): void {
  openGate(w);
  w.boss = 'waiting';
  w.enemies = w.enemies.filter((e) => e.kind !== 'boss');
  const spawn = level.spawns.find((s) => s.kind === 'boss');
  if (spawn) w.enemies.push(createEnemy(spawn, w.nextId++));
}
