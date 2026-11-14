import type { EnemyKind } from './level.ts';
import type { Body, Box } from './physics.ts';
import type { Grid } from './tiles.ts';

/** The whole control scheme: five buttons. */
export interface Input {
  left: boolean;
  right: boolean;
  jump: boolean;
  slash: boolean;
  parry: boolean;
}

export const NO_INPUT: Input = { left: false, right: false, jump: false, slash: false, parry: false };

export interface Player extends Body {
  facing: 1 | -1;
  onGround: boolean;
  coyote: number;
  jumpBuffer: number;
  /** True from takeoff until the jump is cut or peaks: governs the short hop. */
  jumping: boolean;
  /** Seconds since the slash started, or -1. */
  slashT: number;
  slashCd: number;
  /** Enemy ids already hit by the current swing (one hit per swing). */
  slashHits: number[];
  /** Seconds since the parry started, or -1. */
  parryT: number;
  parryCd: number;
  invuln: number;
  /** Knockback stun: no control while > 0. */
  stun: number;
  hearts: number;
  prev: Input;
}

export interface Enemy extends Body {
  id: number;
  kind: EnemyKind;
  dir: 1 | -1;
  state: string;
  /** Time in the current state. */
  t: number;
  hp: number;
  onGround: boolean;
  homeX: number;
  homeY: number;
  targetX: number;
  targetY: number;
  /** Brute: time the player has spent behind it. Boss: post-hit invulnerability. */
  aux: number;
  /** Boss: shots fired in the current volley. */
  count: number;
  /** Boss: which attack comes next. */
  phase: number;
}

export interface Ball extends Body {
  owner: 'enemy' | 'player';
  alive: boolean;
}

export type EventType =
  | 'jump'
  | 'spring'
  | 'slash'
  | 'parryStart'
  | 'parry'
  | 'reflect'
  | 'clang'
  | 'kill'
  | 'repel'
  | 'stomp'
  | 'bounce'
  | 'hurt'
  | 'die'
  | 'respawn'
  | 'coin'
  | 'oneUp'
  | 'crate'
  | 'checkpoint'
  | 'goal'
  | 'fire'
  | 'ballHit'
  | 'squawk'
  | 'windup'
  | 'swing'
  | 'bossStart'
  | 'bossHit'
  | 'bossDown'
  | 'thud'
  | 'gameOver';

export interface GameEvent {
  type: EventType;
  x: number;
  y: number;
  kind?: EnemyKind;
}

export type Status = 'playing' | 'dying' | 'won' | 'gameover';

export interface Tally {
  time: number;
  timeBonus: number;
  heartBonus: number;
  goalBonus: number;
}

export interface World {
  levelId: number;
  tick: number;
  /** Seconds of play in this level (stops when the level ends). */
  time: number;
  grid: Grid;
  player: Player;
  enemies: Enemy[];
  balls: Ball[];
  coins: { x: number; y: number; taken: boolean }[];
  checkpoints: { x: number; y: number; active: boolean }[];
  respawn: { x: number; y: number };
  goal: Box;
  /** False while a boss still guards the goal. */
  goalOpen: boolean;
  boss: 'none' | 'waiting' | 'fighting' | 'defeated';
  status: Status;
  statusT: number;
  lives: number;
  score: number;
  doubloons: number;
  defeated: number;
  deaths: number;
  nextId: number;
  tally: Tally | null;
  /** Events raised during the last step, for sound and particles. */
  events: GameEvent[];
}

export interface Carry {
  lives: number;
  score: number;
  doubloons: number;
}
