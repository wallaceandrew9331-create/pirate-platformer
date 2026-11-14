// Enemy behaviour: one small state machine per kind.
import { hurtPlayer, spawnBall, stunBrute } from './actions.ts';
import { bruteSwingOutcome } from './combat.ts';
import { BOSS, BRUTE, CANNON, DECKHAND, PARROT, PLAYER } from './constants.ts';
import type { Spawn } from './level.ts';
import { centerX, centerY, groundBelow, moveBody, overlaps, type Box } from './physics.ts';
import type { Enemy, World } from './types.ts';

const SIZES = {
  deckhand: [DECKHAND.w, DECKHAND.h],
  parrot: [PARROT.w, PARROT.h],
  cannon: [CANNON.w, CANNON.h],
  brute: [BRUTE.w, BRUTE.h],
  boss: [BOSS.w, BOSS.h],
} as const;

export function createEnemy(s: Spawn, id: number): Enemy {
  const [w, h] = SIZES[s.kind];
  // Spawns are anchored at the bottom centre of their tile. Parrots hover
  // a little above it.
  const x = s.x - w / 2;
  const y = s.kind === 'parrot' ? s.y - 14 - h : s.y - h;
  return {
    id,
    kind: s.kind,
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    dir: s.dir,
    state: s.kind === 'boss' ? 'wait' : s.kind === 'parrot' ? 'perch' : 'walk',
    t: s.kind === 'cannon' ? CANNON.interval - CANNON.firstShot : 0,
    hp: s.kind === 'boss' ? BOSS.hp : 1,
    onGround: false,
    homeX: x,
    homeY: y,
    targetX: 0,
    targetY: 0,
    aux: 0,
    count: 0,
    phase: 0,
  };
}

function setState(e: Enemy, state: string): void {
  e.state = state;
  e.t = 0;
}

const GRAVITY = PLAYER.gravity;

function fall(w: World, e: Enemy, dt: number): ReturnType<typeof moveBody> {
  e.vy = Math.min(PLAYER.maxFall, e.vy + GRAVITY * dt);
  const r = moveBody(w.grid, e, dt);
  e.onGround = r.landed;
  return r;
}

/** Walkers turn around at walls and at ledges. */
function ledgeAhead(w: World, e: Enemy): boolean {
  const footX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
  return e.onGround && !groundBelow(w.grid, footX, e.y + e.h - 1);
}

export function stepEnemy(w: World, e: Enemy, dt: number): void {
  e.t += dt;
  switch (e.kind) {
    case 'deckhand':
      return stepDeckhand(w, e, dt);
    case 'parrot':
      return stepParrot(w, e, dt);
    case 'cannon':
      return stepCannon(w, e, dt);
    case 'brute':
      return stepBrute(w, e, dt);
    case 'boss':
      return stepBoss(w, e, dt);
  }
}

// ---------- deckhand: patrols back and forth ----------
function stepDeckhand(w: World, e: Enemy, dt: number): void {
  if (ledgeAhead(w, e)) e.dir = e.dir > 0 ? -1 : 1;
  e.vx = e.dir * DECKHAND.speed;
  const r = fall(w, e, dt);
  if (r.hitWall) e.dir = e.dir > 0 ? -1 : 1;
}

// ---------- parrot: perches, then dives at where you were ----------
function stepParrot(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  const dx = centerX(p) - centerX(e);
  const dy = centerY(p) - centerY(e);
  const bob = Math.sin(w.time * 4 + e.id) * 0.25;
  switch (e.state) {
    case 'perch':
      e.y += bob;
      e.dir = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) < PARROT.triggerRangeX && dy > 8 && dy < PARROT.triggerRangeY && w.status === 'playing') {
        setState(e, 'aim');
        w.events.push({ type: 'squawk', x: centerX(e), y: centerY(e) });
      }
      break;
    case 'aim':
      // Lock on at the end of the wind-up: a dive aims where you *were*.
      e.targetX = centerX(p);
      e.targetY = centerY(p);
      e.dir = dx >= 0 ? 1 : -1;
      if (e.t >= PARROT.aimTime) {
        const ddx = e.targetX - centerX(e);
        const ddy = e.targetY - centerY(e);
        const d = Math.hypot(ddx, ddy) || 1;
        e.vx = (ddx / d) * PARROT.diveSpeed;
        e.vy = (ddy / d) * PARROT.diveSpeed;
        // Overshoot a little past the target so the swoop sweeps through.
        e.aux = Math.min(PARROT.maxDive, d / PARROT.diveSpeed + 0.12);
        setState(e, 'dive');
      }
      break;
    case 'dive':
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.t >= e.aux) setState(e, 'climb');
      break;
    case 'flee':
      e.x += e.dir * 70 * dt;
      e.y -= 95 * dt;
      if (e.t >= PARROT.fleeTime) {
        setState(e, 'climb');
        e.aux = PARROT.fleeCooldown;
      }
      break;
    case 'climb': {
      const hx = e.homeX - e.x;
      const hy = e.homeY - e.y;
      const d = Math.hypot(hx, hy);
      const step = PARROT.climbSpeed * dt;
      if (d <= step) {
        e.x = e.homeX;
        e.y = e.homeY;
        const rest = e.aux > PARROT.cooldown ? e.aux : PARROT.cooldown;
        setState(e, 'rest');
        e.aux = rest;
      } else {
        e.x += (hx / d) * step;
        e.y += (hy / d) * step;
        e.dir = hx >= 0 ? 1 : -1;
      }
      break;
    }
    case 'rest':
      e.y += bob;
      if (e.t >= e.aux) {
        e.aux = 0;
        e.y = e.homeY;
        setState(e, 'perch');
      }
      break;
  }
}

// ---------- cannon: fires along its facing when you're in range ----------
export function cannonInRange(w: World, e: Enemy): boolean {
  const p = w.player;
  const dx = centerX(p) - centerX(e);
  return dx * e.dir > 0 && Math.abs(dx) < CANNON.range && Math.abs(centerY(p) - centerY(e)) < CANNON.rangeY;
}

function stepCannon(w: World, e: Enemy, _dt: number): void {
  if (!cannonInRange(w, e) || w.status !== 'playing') {
    // Out of range the fuse waits, primed: the first shot comes
    // CANNON.firstShot seconds after you walk in.
    e.t = Math.min(e.t, CANNON.interval - CANNON.firstShot);
    return;
  }
  if (e.t >= CANNON.interval) {
    const mx = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
    spawnBall(w, mx, e.y + 5, e.dir * CANNON.ballSpeed);
    w.events.push({ type: 'fire', x: mx, y: e.y + 5 });
    e.t = 0;
  }
}

// ---------- brute: shield up front, slow to turn ----------
export function swingBox(e: Enemy): Box {
  return { x: e.dir > 0 ? e.x + e.w - 4 : e.x - BRUTE.swingReach + 4, y: e.y - 4, w: BRUTE.swingReach, h: e.h + 4 };
}

/** How long the player must stay behind a brute before it turns round. */
export const BRUTE_TURN_DELAY = 0.75;

function stepBrute(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  const dx = centerX(p) - centerX(e);
  const near = Math.abs(dx) < 150 && Math.abs(centerY(p) - centerY(e)) < 48;
  switch (e.state) {
    case 'walk': {
      const behind = dx * e.dir < 0;
      if (near && behind) {
        e.aux += dt;
        if (e.aux >= BRUTE_TURN_DELAY) {
          e.dir = e.dir > 0 ? -1 : 1;
          e.aux = 0;
        }
      } else e.aux = 0;
      const inFront = dx * e.dir > 0;
      if (near && inFront && Math.abs(dx) < BRUTE.reachFront && Math.abs(centerY(p) - centerY(e)) < 22 && w.status === 'playing') {
        e.vx = 0;
        setState(e, 'windup');
        w.events.push({ type: 'windup', x: centerX(e), y: e.y });
        break;
      }
      // Advance on the player when close, otherwise patrol.
      const advance = near && inFront && Math.abs(dx) > BRUTE.reachFront - 8;
      if (!near || advance) {
        if (ledgeAhead(w, e)) e.dir = e.dir > 0 ? -1 : 1;
        e.vx = e.dir * BRUTE.speed;
      } else e.vx = 0;
      break;
    }
    case 'windup':
      if (e.t >= BRUTE.windup) {
        setState(e, 'swing');
        w.events.push({ type: 'swing', x: centerX(e), y: e.y });
      }
      break;
    case 'swing':
      if (overlaps(swingBox(e), p) && w.status === 'playing') {
        if (bruteSwingOutcome(p, e) === 'stun') {
          stunBrute(w, e);
          // A clean parry ends the brace at once so you can riposte.
          p.parryCd = 0;
          p.parryT = -1;
          break;
        }
        hurtPlayer(w, centerX(e));
      }
      if (e.t >= BRUTE.swing) setState(e, 'recover');
      break;
    case 'recover':
      if (e.t >= BRUTE.recover) setState(e, 'walk');
      break;
    case 'stunned':
      if (e.t >= BRUTE.stun) setState(e, 'walk');
      break;
  }
  const r = fall(w, e, dt);
  if (r.hitWall && e.state === 'walk') e.dir = e.dir > 0 ? -1 : 1;
}

// ---------- boss: cannon volleys and shoulder charges ----------
function stepBoss(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  const angry = e.hp <= BOSS.hp / 2;
  e.aux = Math.max(0, e.aux - dt);
  const face = (): void => {
    e.dir = centerX(p) >= centerX(e) ? 1 : -1;
  };
  switch (e.state) {
    case 'wait':
      face();
      e.vx = 0;
      break;
    case 'idle':
      face();
      e.vx = 0;
      if (e.t >= (angry ? BOSS.idle * 0.65 : BOSS.idle)) {
        e.phase += 1;
        e.count = 0;
        const next = e.phase % 2 === 1 ? 'volley' : 'windup';
        setState(e, next);
        if (next === 'windup') w.events.push({ type: 'windup', x: centerX(e), y: e.y });
      }
      break;
    case 'volley': {
      face();
      const shots = angry ? BOSS.volleyShots + 1 : BOSS.volleyShots;
      if (e.t >= BOSS.volleyGap) {
        const mx = e.dir > 0 ? e.x + e.w + 3 : e.x - 3;
        const my = e.y + e.h - 9;
        spawnBall(w, mx, my, e.dir * BOSS.ballSpeed);
        w.events.push({ type: 'fire', x: mx, y: my });
        e.count += 1;
        e.t = 0;
        if (e.count >= shots) setState(e, 'idle');
      }
      break;
    }
    case 'windup':
      face();
      if (e.t >= BOSS.windup) setState(e, 'charge');
      break;
    case 'charge':
      e.vx = e.dir * BOSS.chargeSpeed * (angry ? 1.15 : 1);
      break;
    case 'stunned':
      e.vx = 0;
      if (e.t >= BOSS.stun) setState(e, 'idle');
      break;
  }
  const r = fall(w, e, dt);
  if (e.state === 'charge' && r.hitWall) {
    setState(e, 'stunned');
    e.count = 0;
    w.events.push({ type: 'thud', x: e.dir > 0 ? e.x + e.w : e.x, y: centerY(e) });
  }
}
