import { PARRY, PLAYER, SLASH } from './constants.ts';
import { moveBody, type MoveResult } from './physics.ts';
import { T, type Grid } from './tiles.ts';
import type { GameEvent, Input, Player } from './types.ts';

export function createPlayer(x: number, bottom: number): Player {
  return {
    x,
    y: bottom - PLAYER.h,
    w: PLAYER.w,
    h: PLAYER.h,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    coyote: 0,
    jumpBuffer: 0,
    jumping: false,
    slashT: -1,
    slashCd: 0,
    slashHits: [],
    parryT: -1,
    parryCd: 0,
    invuln: 0,
    stun: 0,
    hearts: PLAYER.maxHearts,
    prev: { left: false, right: false, jump: false, slash: false, parry: false },
  };
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

/**
 * One fixed step of the pirate's controller: run, jump (with coyote time,
 * jump buffering and variable height), gravity, collision, and starting
 * slashes and parries. Hits are resolved afterwards in world.ts.
 */
export function stepPlayer(p: Player, grid: Grid, input: Input, dt: number, events: GameEvent[]): MoveResult {
  const pressedJump = input.jump && !p.prev.jump;
  const pressedSlash = input.slash && !p.prev.slash;
  const pressedParry = input.parry && !p.prev.parry;
  const releasedJump = !input.jump && p.prev.jump;

  // --- timers ---
  p.slashCd = Math.max(0, p.slashCd - dt);
  p.parryCd = Math.max(0, p.parryCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.stun = Math.max(0, p.stun - dt);
  if (p.slashT >= 0) {
    p.slashT += dt;
    if (p.slashT >= SLASH.duration) p.slashT = -1;
  }
  if (p.parryT >= 0) {
    p.parryT += dt;
    if (p.parryT >= PARRY.duration) p.parryT = -1;
  }
  const control = p.stun <= 0;

  // --- run ---
  let move = control ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
  // Facing is locked mid-swing so a slash can't be turned around.
  if (move !== 0 && p.slashT < 0 && p.parryT < 0) p.facing = move > 0 ? 1 : -1;
  // Bracing for a parry plants your feet.
  if (p.parryT >= 0 && p.onGround) move = 0;
  const target = move * PLAYER.maxSpeed;
  const accel = p.onGround ? (move !== 0 ? PLAYER.groundAccel : PLAYER.groundDecel) : PLAYER.airAccel;
  if (control) p.vx = approach(p.vx, target, accel * dt);

  // --- jump ---
  p.jumpBuffer = pressedJump ? PLAYER.jumpBuffer : Math.max(0, p.jumpBuffer - dt);
  p.coyote = p.onGround ? PLAYER.coyoteTime : Math.max(0, p.coyote - dt);
  if (control && p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = -PLAYER.jumpSpeed;
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.onGround = false;
    p.jumping = true;
    events.push({ type: 'jump', x: p.x + p.w / 2, y: p.y + p.h });
  }
  if (releasedJump && p.jumping && p.vy < 0) {
    p.vy *= PLAYER.jumpCut;
    p.jumping = false;
  }
  if (p.vy >= 0) p.jumping = false;

  // --- gravity + collision ---
  const g = input.jump && p.vy < 0 ? PLAYER.gravityHold : PLAYER.gravity;
  p.vy = Math.min(PLAYER.maxFall, p.vy + g * dt);
  const r = moveBody(grid, p, dt);
  p.onGround = r.landed;
  if (r.landed && r.floor === T.Spring) {
    p.vy = -PLAYER.springSpeed;
    p.onGround = false;
    p.coyote = 0;
    p.jumping = false;
    events.push({ type: 'spring', x: p.x + p.w / 2, y: p.y + p.h });
  }

  // --- attacks ---
  if (control && pressedSlash && p.slashCd <= 0 && p.parryT < 0) {
    p.slashT = 0;
    p.slashCd = SLASH.cooldown;
    p.slashHits = [];
    events.push({ type: 'slash', x: p.x + p.w / 2, y: p.y });
  }
  if (control && pressedParry && p.parryCd <= 0 && p.slashT < 0) {
    p.parryT = 0;
    p.parryCd = PARRY.cooldown;
    events.push({ type: 'parryStart', x: p.x + p.w / 2, y: p.y });
  }

  p.prev = { ...input };
  return r;
}
