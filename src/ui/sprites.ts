// Every character is pixel art drawn in code with fillRect on the low-res
// canvas: no image files. Each draw function works in local coordinates with
// the origin at the bottom-centre of the body and +x pointing the way the
// character faces; withFacing() mirrors it.
import { BRUTE, PARROT, PARRY, SLASH } from '../game/constants.ts';
import type { Enemy, Player } from '../game/types.ts';

type Ctx = CanvasRenderingContext2D;

export function R(c: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

export function withFacing(c: Ctx, x: number, y: number, facing: number, draw: () => void): void {
  c.save();
  c.translate(Math.round(x), Math.round(y));
  if (facing < 0) c.scale(-1, 1);
  draw();
  c.restore();
}

const P = {
  boot: '#3a2418',
  pants: '#d9c08a',
  coat: '#2b8c86',
  coatDark: '#1f6662',
  sash: '#c8323c',
  skin: '#f1c28f',
  hat: '#2a1d1a',
  trim: '#e8b84a',
  blade: '#e6eef5',
  hilt: '#b8862e',
  eye: '#1a1010',
};

// ---------------------------------------------------------------- player
export function drawPlayer(c: Ctx, p: Player, time: number): void {
  if (p.invuln > 0 && Math.floor(time * 20) % 2 === 0) return; // hurt flicker
  const cx = p.x + p.w / 2;
  const by = p.y + p.h;
  const running = p.onGround && Math.abs(p.vx) > 20;
  const phase = running ? Math.floor(time * 12) % 4 : 0;
  withFacing(c, cx, by, p.facing, () => {
    // legs
    if (!p.onGround) {
      R(c, P.boot, -4, -5, 3, 3);
      R(c, P.boot, 1, -4, 3, 3);
    } else {
      const a = [0, -1, 0, 1][phase]!;
      R(c, P.boot, -4 + a, -4, 3, 4);
      R(c, P.boot, 1 - a, -4, 3, 4);
    }
    R(c, P.pants, -4, -7, 8, 3);
    // coat with tails
    R(c, P.coatDark, -6, -11, 2, 6);
    R(c, P.coat, -5, -13, 9, 7);
    R(c, P.sash, -5, -8, 9, 2);
    R(c, P.trim, 0, -12, 1, 4);
    // head
    R(c, P.skin, -3, -18, 7, 5);
    R(c, P.eye, 2, -16, 1, 1);
    R(c, '#8a4b2a', -3, -14, 2, 1); // a scruffy sideburn
    // tricorn hat with a red plume
    R(c, P.hat, -5, -20, 11, 2);
    R(c, P.hat, -3, -22, 7, 2);
    R(c, P.trim, -5, -18, 11, 1);
    R(c, P.sash, -5, -23, 2, 3);

    const slashing = p.slashT >= 0;
    const parrying = p.parryT >= 0;
    if (slashing) {
      // Sword thrust forward plus a swept arc while the blade is live.
      R(c, P.skin, 3, -11, 3, 2);
      R(c, P.hilt, 6, -12, 1, 4);
      R(c, P.blade, 7, -11, 9, 2);
      const k = p.slashT / SLASH.duration;
      if (p.slashT <= SLASH.activeTo + 0.04) {
        c.save();
        c.globalAlpha = 0.85 - k * 0.8;
        c.strokeStyle = '#ffffff';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(4, -9, 14, -1.3 + k * 0.6, 1.0 + k * 0.6);
        c.stroke();
        c.strokeStyle = '#9fe3ff';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(4, -9, 17, -1.1 + k * 0.6, 0.8 + k * 0.6);
        c.stroke();
        c.restore();
      }
    } else if (parrying) {
      // Blade raised upright across the body.
      R(c, P.skin, 3, -11, 2, 2);
      R(c, P.hilt, 4, -10, 3, 1);
      R(c, P.blade, 5, -22, 2, 12);
      if (p.parryT <= PARRY.window) {
        c.save();
        c.globalAlpha = 0.75 - (p.parryT / PARRY.window) * 0.5;
        c.strokeStyle = '#fff6b0';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(6, -12, 9 + p.parryT * 20, -1.4, 1.4);
        c.stroke();
        c.restore();
      }
    } else {
      // Resting: cutlass held low and forward.
      R(c, P.skin, 3, -10, 2, 2);
      R(c, P.hilt, 4, -9, 2, 1);
      R(c, P.blade, 5, -9, 1, 1);
      R(c, P.blade, 6, -8, 1, 1);
      R(c, P.blade, 7, -7, 1, 1);
      R(c, P.blade, 8, -6, 1, 1);
    }
  });
}

/** The pirate tumbling away on death. */
export function drawPlayerDeath(c: Ctx, p: Player, t: number): void {
  const cx = p.x + p.w / 2;
  const y = p.y + p.h - 20 * t + 160 * t * t;
  c.save();
  c.translate(Math.round(cx), Math.round(y));
  c.rotate(t * 7);
  R(c, P.coat, -5, -7, 9, 7);
  R(c, P.skin, -3, -12, 7, 5);
  R(c, P.hat, -5, -14, 11, 2);
  c.restore();
}

// ---------------------------------------------------------------- deckhand
export function drawDeckhand(c: Ctx, e: Enemy, time: number): void {
  const phase = Math.floor(time * 8 + e.id) % 2;
  withFacing(c, e.x + e.w / 2, e.y + e.h, e.dir, () => {
    R(c, '#2a1d1a', -4 + phase, -3, 3, 3);
    R(c, '#2a1d1a', 1 - phase, -3, 3, 3);
    R(c, '#4a4f7a', -4, -6, 8, 3); // trousers
    // striped shirt
    for (let i = 0; i < 4; i++) R(c, i % 2 ? '#2c4f9c' : '#f2efe6', -5, -11 + i * 1.25, 10, 1.25);
    R(c, '#e3a87a', -3, -16, 7, 5); // face
    R(c, '#1a1010', 2, -14, 1, 1);
    R(c, '#c8323c', -4, -17, 9, 2); // bandana
    R(c, '#c8323c', -6, -16, 2, 2); // knot
    // a belaying-pin club
    R(c, '#7a4a28', 4, -12, 2, 6);
  });
}

// ---------------------------------------------------------------- parrot
export function drawParrot(c: Ctx, e: Enemy, time: number): void {
  const diving = e.state === 'dive';
  const aiming = e.state === 'aim';
  const flap = Math.floor(time * (diving ? 4 : 14) + e.id) % 2;
  const shake = aiming ? (Math.floor(time * 30) % 2) - 0.5 : 0;
  withFacing(c, e.x + e.w / 2 + shake, e.y + e.h, e.dir, () => {
    const body = e.state === 'flee' ? '#9bd36a' : '#2fa84a';
    R(c, body, -4, -8, 8, 6);
    R(c, '#d8352a', -6, -6, 3, 3); // tail
    R(c, '#2a6fd0', -7, -4, 2, 3);
    R(c, body, 1, -10, 5, 4); // head
    R(c, '#f4f0d0', 4, -9, 1, 1);
    R(c, '#1a1010', 4, -9, 1, 1);
    R(c, '#f2b23a', 6, -8, 2, 2); // beak
    if (diving) {
      R(c, '#1f7f38', -5, -11, 8, 2); // wings swept back
    } else if (flap) {
      R(c, '#1f7f38', -3, -13, 5, 4);
      R(c, '#f2d04a', -3, -13, 2, 1);
    } else {
      R(c, '#1f7f38', -3, -4, 5, 3);
    }
    R(c, '#c99a30', -1, -2, 1, 2);
    R(c, '#c99a30', 1, -2, 1, 2);
  });
  if (aiming) {
    c.fillStyle = '#ffde59';
    c.fillRect(Math.round(e.x + e.w / 2), Math.round(e.y - 9), 1, 4);
    c.fillRect(Math.round(e.x + e.w / 2), Math.round(e.y - 4), 1, 1);
  }
  void PARROT;
}

// ---------------------------------------------------------------- cannon
export function drawCannon(c: Ctx, e: Enemy, recoil: number): void {
  withFacing(c, e.x + e.w / 2, e.y + e.h, e.dir, () => {
    const k = Math.max(0, 1 - recoil * 5);
    const back = Math.round(k * 2);
    R(c, '#6b4226', -7, -5, 13, 4); // carriage
    R(c, '#4a2c18', -6, -2, 3, 2);
    R(c, '#4a2c18', 2, -2, 3, 2);
    R(c, '#8a5a32', -4, -1, 1, 1);
    R(c, '#2b2b35', -6 - back, -11, 13, 6); // barrel
    R(c, '#444452', -6 - back, -11, 13, 2);
    R(c, '#1a1a20', 6 - back, -11, 2, 6); // muzzle ring
    R(c, '#c99a30', -3 - back, -11, 1, 6);
    if (k > 0.3) {
      R(c, '#fff3a0', 8, -10, 3, 4);
      R(c, '#ff9f3a', 11, -9, 2, 2);
    }
  });
}

// ---------------------------------------------------------------- brute
export function drawBrute(c: Ctx, e: Enemy, time: number): void {
  const stunned = e.state === 'stunned';
  const windup = e.state === 'windup';
  const swing = e.state === 'swing';
  const step = e.vx !== 0 ? Math.floor(time * 5 + e.id) % 2 : 0;
  withFacing(c, e.x + e.w / 2, e.y + e.h, e.dir, () => {
    R(c, '#2a1d1a', -6 + step, -4, 4, 4);
    R(c, '#2a1d1a', 2 - step, -4, 4, 4);
    R(c, '#5d4a3a', -6, -8, 12, 4);
    R(c, '#6d7a52', -7, -15, 14, 8); // heavy coat
    R(c, '#3e4a30', -7, -10, 14, 1);
    R(c, '#d9a27a', -4, -20, 8, 5); // face
    R(c, '#1a1010', 2, -18, 1, 1);
    R(c, '#4a2a1a', -4, -16, 8, 1); // beard line
    // spiked helmet
    R(c, '#8d939e', -5, -23, 10, 3);
    R(c, '#c5ccd6', -1, -26, 2, 3);
    R(c, '#c5ccd6', -4, -25, 1, 2);
    R(c, '#c5ccd6', 3, -25, 1, 2);
    // axe: raised in windup, chopping down in swing
    if (windup) {
      R(c, '#7a4a28', -2, -32, 2, 14);
      R(c, '#c5ccd6', -6, -33, 5, 5);
    } else if (swing) {
      R(c, '#7a4a28', 6, -12, 12, 2);
      R(c, '#c5ccd6', 15, -16, 5, 8);
      R(c, '#ffffff', 19, -15, 1, 6);
    } else {
      R(c, '#7a4a28', -8, -18, 2, 12);
      R(c, '#c5ccd6', -11, -19, 4, 5);
    }
    // the big shield in front (dropped when stunned)
    if (stunned) {
      R(c, '#7d838e', 2, -6, 10, 4);
    } else {
      R(c, '#9aa1ac', 5, -19, 5, 16);
      R(c, '#c5ccd6', 6, -18, 3, 14);
      R(c, '#c99a30', 7, -12, 1, 2);
    }
  });
  if (stunned) {
    // circling stars
    for (let i = 0; i < 3; i++) {
      const a = time * 6 + (i * Math.PI * 2) / 3;
      R(c, '#ffe066', Math.round(e.x + e.w / 2 + Math.cos(a) * 7), Math.round(e.y - 10 + Math.sin(a) * 2), 2, 2);
    }
  }
  if (windup && Math.floor(time * 16) % 2 === 0) R(c, '#ff5a3a', Math.round(e.x + e.w / 2) - 1, Math.round(e.y - 16), 2, 4);
  void BRUTE;
}

// ---------------------------------------------------------------- boss
export function drawBoss(c: Ctx, e: Enemy, time: number): void {
  const stunned = e.state === 'stunned';
  const charging = e.state === 'charge';
  const windup = e.state === 'windup';
  const hit = e.aux > 0 && Math.floor(time * 24) % 2 === 0;
  const bob = charging ? Math.floor(time * 14) % 2 : 0;
  withFacing(c, e.x + e.w / 2, e.y + e.h, e.dir, () => {
    const coat = hit ? '#ffffff' : '#4b2a6b';
    const coatDark = hit ? '#eeeeee' : '#331c4a';
    R(c, '#1e1418', -9 + bob, -6, 7, 6); // boots
    R(c, '#1e1418', 3 - bob, -6, 7, 6);
    R(c, coatDark, -13, -22, 4, 16); // coat tails
    R(c, coat, -11, -24, 22, 18);
    R(c, '#e8b84a', -11, -12, 22, 2); // belt
    R(c, '#a77a2a', -2, -13, 4, 4);
    R(c, '#e8b84a', 2, -23, 1, 10);
    // pale, barnacled face and a sea-green beard
    R(c, hit ? '#ffffff' : '#c9d6c8', -6, -32, 12, 8);
    R(c, '#2d7f72', -6, -26, 12, 4);
    R(c, '#2d7f72', -3, -23, 6, 2);
    R(c, stunned ? '#ffe066' : '#ff3a2a', 3, -30, 2, 2); // glowing eye
    R(c, '#8aa39a', -5, -31, 2, 2);
    // bicorne hat with a skull badge
    R(c, '#1a1220', -12, -36, 24, 4);
    R(c, '#1a1220', -7, -40, 14, 4);
    R(c, '#e8b84a', -12, -33, 24, 1);
    R(c, '#f2efe6', -1, -38, 3, 3);
    // hand cannon arm
    if (windup || charging) {
      R(c, '#2b2b35', 8, -20, 6, 8); // shoulder lowered
    } else {
      R(c, coat, 9, -21, 4, 6);
      R(c, '#2b2b35', 11, -14, 9, 5);
      R(c, '#1a1a20', 18, -14, 2, 5);
    }
  });
  if (stunned) {
    for (let i = 0; i < 4; i++) {
      const a = time * 5 + (i * Math.PI) / 2;
      R(c, '#ffe066', Math.round(e.x + e.w / 2 + Math.cos(a) * 12), Math.round(e.y - 6 + Math.sin(a) * 3), 2, 2);
    }
  }
  if (windup && Math.floor(time * 16) % 2 === 0) R(c, '#ff5a3a', Math.round(e.x + e.w / 2) - 1, Math.round(e.y - 14), 2, 5);
}

export function drawEnemy(c: Ctx, e: Enemy, time: number): void {
  switch (e.kind) {
    case 'deckhand':
      return drawDeckhand(c, e, time);
    case 'parrot':
      return drawParrot(c, e, time);
    case 'cannon':
      return drawCannon(c, e, e.t);
    case 'brute':
      return drawBrute(c, e, time);
    case 'boss':
      return drawBoss(c, e, time);
  }
}
