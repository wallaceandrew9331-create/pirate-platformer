// The combat rules as small pure functions, so each one is unit-testable on
// its own. world.ts applies the outcomes.
import { PARRY, SLASH } from './constants.ts';
import { centerX, type Box } from './physics.ts';
import type { Ball, Enemy, Player } from './types.ts';

export function slashActive(p: Player): boolean {
  return p.slashT >= SLASH.activeFrom && p.slashT <= SLASH.activeTo;
}

export function parryActive(p: Player): boolean {
  return p.parryT >= 0 && p.parryT <= PARRY.window;
}

/** The blade's hitbox: in front of the pirate, a little taller than them. */
export function slashBox(p: Player): Box {
  return {
    x: p.facing > 0 ? p.x + p.w - 2 : p.x - SLASH.reach + 2,
    y: p.y - 3,
    w: SLASH.reach,
    h: p.h + 5,
  };
}

/** Is the player on the side the enemy is NOT facing? */
export function isBehind(e: Enemy, p: Box): boolean {
  return e.dir > 0 ? centerX(p) < centerX(e) : centerX(p) > centerX(e);
}

/** Does the player face toward something at x? */
export function facingToward(p: Player, x: number): boolean {
  return p.facing > 0 ? x >= centerX(p) - 2 : x <= centerX(p) + 2;
}

export type SlashOutcome = 'kill' | 'damage' | 'blocked' | 'repel' | 'none';

/**
 * What a sword hit does to each enemy:
 * - deckhand: dies.
 * - parrot: can't be killed, but a hit bats it away for a while.
 * - cannon: iron; the blade just clangs. Only its own ball, parried back, breaks it.
 * - brute: its shield blocks from the front. Hit it from behind, or parry its
 *   swing to stun it, and one hit ends it.
 * - boss: blocks unless stunned; each stunned hit costs it one HP.
 */
export function slashOutcome(e: Enemy, p: Player): SlashOutcome {
  switch (e.kind) {
    case 'deckhand':
      return 'kill';
    case 'parrot':
      return e.state === 'flee' ? 'none' : 'repel';
    case 'cannon':
      return 'blocked';
    case 'brute':
      return e.state === 'stunned' || isBehind(e, p) ? 'kill' : 'blocked';
    case 'boss':
      if (e.state === 'wait') return 'none';
      if (e.state !== 'stunned') return 'blocked';
      return e.aux > 0 ? 'none' : 'damage';
  }
}

/** Was this contact a stomp: player falling onto the enemy's head? */
export function isStomp(p: Player, e: Box, prevBottom: number): boolean {
  return p.vy > 0 && prevBottom <= e.y + 6;
}

export type StompOutcome = 'kill' | 'bounce' | 'hurt';

export function stompOutcome(e: Enemy): StompOutcome {
  switch (e.kind) {
    case 'deckhand':
      return 'kill';
    case 'parrot':
      return 'hurt'; // all beak and claws: dodge it or bat it away
    case 'cannon':
    case 'brute': // a spiked helmet: you bounce off, no damage either way
    case 'boss':
      return 'bounce';
  }
}

/** Does touching this enemy (not from above) hurt? */
export function contactHurts(e: Enemy): boolean {
  switch (e.kind) {
    case 'deckhand':
      return true;
    case 'parrot':
      return e.state !== 'flee';
    case 'cannon':
      return false;
    case 'brute':
      return e.state !== 'stunned';
    case 'boss':
      return e.state !== 'stunned' && e.state !== 'wait';
  }
}

export type BallOutcome = 'reflect' | 'hurt';

/** An enemy cannonball reaching the player: parried back if the parry is up and facing it. */
export function ballVsPlayer(p: Player, b: Ball): BallOutcome {
  return parryActive(p) && facingToward(p, centerX(b)) ? 'reflect' : 'hurt';
}

export type ReflectOutcome = 'kill' | 'damage' | 'repel' | 'none';

/** A parried ball flying back into an enemy. */
export function reflectedBallOutcome(e: Enemy): ReflectOutcome {
  switch (e.kind) {
    case 'deckhand':
    case 'brute':
    case 'cannon':
      return 'kill';
    case 'parrot':
      return 'repel';
    case 'boss':
      return e.state === 'wait' || e.aux > 0 ? 'none' : 'damage';
  }
}

export type SwingOutcome = 'stun' | 'hurt';

/** The brute's overhead swing landing on the player. */
export function bruteSwingOutcome(p: Player, e: Enemy): SwingOutcome {
  return parryActive(p) && facingToward(p, centerX(e)) ? 'stun' : 'hurt';
}
