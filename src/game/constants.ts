// Every tuning number in one place. Units are pixels and seconds; one tile
// is 16 px and the sim runs at a fixed 60 steps per second.

export const TILE = 16;
export const DT = 1 / 60;

export const PLAYER = {
  w: 10,
  h: 14,
  maxSpeed: 128,
  groundAccel: 1150,
  groundDecel: 1500,
  airAccel: 800,
  jumpSpeed: 322,
  /** Gravity while rising with jump held: floaty, high jumps. */
  gravityHold: 820,
  /** Gravity otherwise: snappy falls. */
  gravity: 1350,
  maxFall: 420,
  /** Releasing jump early multiplies upward speed by this: short hops. */
  jumpCut: 0.42,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  stompBounce: 250,
  stompBounceHeld: 340,
  springSpeed: 520,
  maxHearts: 3,
  hurtInvuln: 1.2,
  respawnInvuln: 1.6,
  hurtKnockX: 150,
  hurtKnockY: 190,
  hurtStun: 0.3,
} as const;

export const SLASH = {
  /** The blade only hurts between these two times after the press. */
  activeFrom: 0.03,
  activeTo: 0.16,
  duration: 0.22,
  cooldown: 0.32,
  reach: 22,
  /** Bounce back off a shield. */
  clangKnock: 110,
} as const;

export const PARRY = {
  window: 0.2,
  duration: 0.3,
  cooldown: 0.55,
  /** A successful parry refunds this much of the cooldown (all of it). */
  reflectSpeedScale: 1.6,
} as const;

export const DECKHAND = { w: 12, h: 14, speed: 34 } as const;

export const PARROT = {
  w: 12,
  h: 10,
  triggerRangeX: 112,
  triggerRangeY: 150,
  aimTime: 0.4,
  diveSpeed: 175,
  maxDive: 1.1,
  climbSpeed: 80,
  cooldown: 1.1,
  fleeTime: 0.8,
  fleeCooldown: 2.2,
} as const;

export const CANNON = {
  w: 16,
  h: 12,
  range: 230,
  rangeY: 72,
  interval: 2.3,
  firstShot: 0.9,
  ballSpeed: 110,
  ball: 6,
} as const;

export const BRUTE = {
  w: 14,
  h: 18,
  speed: 22,
  reachFront: 34,
  windup: 0.45,
  swing: 0.15,
  recover: 0.55,
  stun: 1.5,
  swingReach: 24,
} as const;

export const BOSS = {
  w: 26,
  h: 32,
  hp: 6,
  idle: 0.9,
  volleyGap: 0.6,
  volleyShots: 3,
  windup: 0.55,
  chargeSpeed: 185,
  stun: 1.8,
  hitInvuln: 0.35,
  hitsPerStun: 2,
  ballSpeed: 120,
} as const;

export const SCORE = {
  coin: 10,
  deckhand: 100,
  parrot: 50,
  cannon: 200,
  brute: 300,
  boss: 2000,
  goal: 1000,
  heartBonus: 250,
  timeBonusPerSec: 10,
} as const;

export const START_LIVES = 3;
export const COINS_PER_LIFE = 100;
export const DEATH_PAUSE = 1.3;
