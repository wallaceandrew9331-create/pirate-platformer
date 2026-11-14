// State changes shared by the player, enemy and world steps.
import { BOSS, CANNON, COINS_PER_LIFE, PLAYER, SCORE, TILE } from './constants.ts';
import { centerX, centerY } from './physics.ts';
import { setTile, T, tileAt } from './tiles.ts';
import type { Enemy, World } from './types.ts';

export function hurtPlayer(w: World, fromX: number): void {
  const p = w.player;
  if (p.invuln > 0 || w.status !== 'playing') return;
  p.hearts -= 1;
  p.invuln = PLAYER.hurtInvuln;
  p.stun = PLAYER.hurtStun;
  p.slashT = -1;
  p.parryT = -1;
  const away = centerX(p) >= fromX ? 1 : -1;
  p.vx = away * PLAYER.hurtKnockX;
  p.vy = -PLAYER.hurtKnockY;
  p.onGround = false;
  w.events.push({ type: 'hurt', x: centerX(p), y: centerY(p) });
  if (p.hearts <= 0) killPlayer(w);
}

export function killPlayer(w: World): void {
  if (w.status !== 'playing') return;
  w.player.hearts = 0;
  w.status = 'dying';
  w.statusT = 0;
  w.deaths += 1;
  w.events.push({ type: 'die', x: centerX(w.player), y: centerY(w.player) });
}

export function addCoins(w: World, n: number, x: number, y: number): void {
  for (let i = 0; i < n; i++) {
    w.doubloons += 1;
    w.score += SCORE.coin;
    w.events.push({ type: 'coin', x, y });
    if (w.doubloons >= COINS_PER_LIFE) {
      w.doubloons -= COINS_PER_LIFE;
      w.lives += 1;
      w.events.push({ type: 'oneUp', x, y });
    }
  }
}

export function breakCrate(w: World, tx: number, ty: number): boolean {
  if (tileAt(w.grid, tx, ty) !== T.Crate) return false;
  setTile(w.grid, tx, ty, T.Empty);
  const x = tx * TILE + TILE / 2;
  const y = ty * TILE + TILE / 2;
  w.events.push({ type: 'crate', x, y });
  addCoins(w, 3, x, y);
  return true;
}

const KILL_SCORE = { deckhand: SCORE.deckhand, parrot: SCORE.parrot, cannon: SCORE.cannon, brute: SCORE.brute, boss: SCORE.boss };

export function killEnemy(w: World, e: Enemy): void {
  const i = w.enemies.indexOf(e);
  if (i < 0) return;
  w.enemies.splice(i, 1);
  w.score += KILL_SCORE[e.kind];
  w.defeated += 1;
  w.events.push({ type: 'kill', x: centerX(e), y: centerY(e), kind: e.kind });
  if (e.kind === 'boss') bossDefeated(w, e);
}

function bossDefeated(w: World, e: Enemy): void {
  w.boss = 'defeated';
  w.goalOpen = true;
  openGate(w);
  w.events.push({ type: 'bossDown', x: centerX(e), y: centerY(e) });
}

export function damageBoss(w: World, e: Enemy): void {
  e.hp -= 1;
  e.aux = BOSS.hitInvuln;
  // At most two sword hits per stun, then the captain shakes it off.
  if (e.state === 'stunned') {
    e.count += 1;
    if (e.count >= BOSS.hitsPerStun) {
      e.state = 'idle';
      e.t = 0;
    }
  }
  w.events.push({ type: 'bossHit', x: centerX(e), y: centerY(e), kind: 'boss' });
  if (e.hp <= 0) killEnemy(w, e);
}

export function repelParrot(w: World, e: Enemy): void {
  e.state = 'flee';
  e.t = 0;
  e.dir = centerX(w.player) < centerX(e) ? 1 : -1;
  w.score += SCORE.parrot;
  w.events.push({ type: 'repel', x: centerX(e), y: centerY(e), kind: 'parrot' });
}

export function stunBrute(w: World, e: Enemy): void {
  e.state = 'stunned';
  e.t = 0;
  e.vx = 0;
  w.events.push({ type: 'parry', x: centerX(e), y: centerY(e), kind: 'brute' });
}

export function spawnBall(w: World, x: number, y: number, vx: number): void {
  const s = CANNON.ball;
  w.balls.push({ x: x - s / 2, y: y - s / 2, w: s, h: s, vx, vy: 0, owner: 'enemy', alive: true });
}

/** The boss gate is a column of Gate tiles at level.gateX, filled only where it is empty. */
export function closeGate(w: World, gateX: number): void {
  const tx = Math.floor(gateX / TILE);
  for (let ty = 0; ty < w.grid.h; ty++) if (tileAt(w.grid, tx, ty) === T.Empty) setTile(w.grid, tx, ty, T.Gate);
}

export function openGate(w: World): void {
  for (let i = 0; i < w.grid.tiles.length; i++) if (w.grid.tiles[i] === T.Gate) w.grid.tiles[i] = T.Empty;
}
