import { TILE } from './constants.ts';
import { isSolid, T, tileAt, toTile, type Grid } from './tiles.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Body extends Box {
  vx: number;
  vy: number;
}

export interface MoveResult {
  hitWall: boolean;
  landed: boolean;
  hitCeiling: boolean;
  /** Tile code that was landed on (Solid, OneWay, Spring...), or -1. */
  floor: number;
  /** Tile the body bumped with its head, for crates. */
  ceilingTile: { tx: number; ty: number } | null;
}

const EPS = 1e-6;

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export const centerX = (b: Box): number => b.x + b.w / 2;
export const centerY = (b: Box): number => b.y + b.h / 2;

/**
 * Moves a body through the tile grid one axis at a time (x first, then y)
 * and stops it flush against whatever it hits. Per-step movement is always
 * well under one tile (max ~9 px at 60 Hz), so nothing tunnels.
 *
 * One-way platforms only catch a body that is falling and whose feet were
 * at or above the platform's top before the move.
 */
export function moveBody(g: Grid, b: Body, dt: number): MoveResult {
  const r: MoveResult = { hitWall: false, landed: false, hitCeiling: false, floor: -1, ceilingTile: null };

  // --- horizontal ---
  const dx = b.vx * dt;
  if (dx !== 0) {
    b.x += dx;
    const top = toTile(b.y + EPS);
    const bottom = toTile(b.y + b.h - EPS);
    if (dx > 0) {
      const tx = toTile(b.x + b.w - EPS);
      for (let ty = top; ty <= bottom; ty++) {
        if (isSolid(tileAt(g, tx, ty))) {
          b.x = tx * TILE - b.w;
          b.vx = 0;
          r.hitWall = true;
          break;
        }
      }
    } else {
      const tx = toTile(b.x + EPS);
      for (let ty = top; ty <= bottom; ty++) {
        if (isSolid(tileAt(g, tx, ty))) {
          b.x = (tx + 1) * TILE;
          b.vx = 0;
          r.hitWall = true;
          break;
        }
      }
    }
  }

  // --- vertical ---
  const dy = b.vy * dt;
  if (dy !== 0) {
    const prevBottom = b.y + b.h;
    b.y += dy;
    const left = toTile(b.x + EPS);
    const right = toTile(b.x + b.w - EPS);
    if (dy > 0) {
      const ty = toTile(b.y + b.h - EPS);
      const tileTop = ty * TILE;
      for (let tx = left; tx <= right; tx++) {
        const code = tileAt(g, tx, ty);
        const oneWayCatch = code === T.OneWay && prevBottom <= tileTop + EPS;
        if (isSolid(code) || oneWayCatch) {
          b.y = tileTop - b.h;
          b.vy = 0;
          r.landed = true;
          // Prefer reporting a spring if either foot is on one.
          if (r.floor !== T.Spring) r.floor = code;
        }
      }
    } else {
      const ty = toTile(b.y + EPS);
      for (let tx = left; tx <= right; tx++) {
        if (isSolid(tileAt(g, tx, ty))) {
          b.y = (ty + 1) * TILE;
          b.vy = 0;
          r.hitCeiling = true;
          r.ceilingTile = { tx, ty };
          break;
        }
      }
    }
  }
  return r;
}

/** True if any tile overlapping the box has the given code. */
export function touchesTile(g: Grid, b: Box, code: number, inset = 0): boolean {
  const l = toTile(b.x + inset);
  const r = toTile(b.x + b.w - inset - EPS);
  const t = toTile(b.y + inset);
  const btm = toTile(b.y + b.h - inset - EPS);
  for (let ty = t; ty <= btm; ty++) for (let tx = l; tx <= r; tx++) if (tileAt(g, tx, ty) === code) return true;
  return false;
}

/** Is there ground (solid or one-way) directly under the given point? */
export function groundBelow(g: Grid, px: number, py: number): boolean {
  const code = tileAt(g, toTile(px), toTile(py + 1));
  return isSolid(code) || code === T.OneWay;
}
