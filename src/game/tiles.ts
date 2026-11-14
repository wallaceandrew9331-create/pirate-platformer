import { TILE } from './constants.ts';

/** Tile codes stored in the world's mutable tile grid. */
export const T = {
  Empty: 0,
  Solid: 1,
  /** Planks and rigging: solid only from above. */
  OneWay: 2,
  Spike: 3,
  Water: 4,
  /** Solid until slashed (or hit by a reflected cannonball); drops doubloons. */
  Crate: 5,
  /** A springy barrel: solid, launches you when you land on it. */
  Spring: 6,
  /** Invisible wall that closes the boss arena. Solid only while the fight is on. */
  Gate: 7,
} as const;
export type TileCode = (typeof T)[keyof typeof T];

export interface Grid {
  w: number;
  h: number;
  tiles: Uint8Array;
}

export function tileAt(g: Grid, tx: number, ty: number): number {
  if (tx < 0 || tx >= g.w) return T.Solid; // the level's side edges are walls
  if (ty < 0 || ty >= g.h) return T.Empty; // open sky above, a pit below
  return g.tiles[ty * g.w + tx]!;
}

export function setTile(g: Grid, tx: number, ty: number, code: number): void {
  if (tx < 0 || tx >= g.w || ty < 0 || ty >= g.h) return;
  g.tiles[ty * g.w + tx] = code;
}

/** Blocks movement from every side. */
export function isSolid(code: number): boolean {
  return code === T.Solid || code === T.Crate || code === T.Spring || code === T.Gate;
}

export const toTile = (px: number): number => Math.floor(px / TILE);
