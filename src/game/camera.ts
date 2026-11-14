import { TILE } from './constants.ts';

export const VIEW_W = 384;
export const VIEW_H = 216;

export interface Camera {
  x: number;
  y: number;
}

/**
 * Side-scroller camera: keeps the player a little left of centre with a
 * small dead zone, looks ahead in the facing direction, and never shows
 * past the level's edges.
 */
export function followCamera(cam: Camera, px: number, py: number, facing: number, levelW: number, levelH: number, dt: number): Camera {
  const lookAhead = facing * 28;
  const targetX = px - VIEW_W * 0.42 + lookAhead;
  const targetY = py - VIEW_H * 0.55;
  const k = 1 - Math.exp(-dt * 6);
  let x = cam.x + (targetX - cam.x) * k;
  let y = cam.y + (targetY - cam.y) * (1 - Math.exp(-dt * 4));
  x = Math.max(0, Math.min(levelW * TILE - VIEW_W, x));
  y = Math.max(0, Math.min(levelH * TILE - VIEW_H, y));
  return { x, y };
}
