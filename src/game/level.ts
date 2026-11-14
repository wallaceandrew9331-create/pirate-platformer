import { TILE } from './constants.ts';
import { T } from './tiles.ts';
import type { Box } from './physics.ts';

export type Theme = 'docks' | 'ship' | 'fortress';
export type EnemyKind = 'deckhand' | 'parrot' | 'cannon' | 'brute' | 'boss';

/**
 * A level as authored: a grid of characters, one per 16 px tile.
 *
 *   .  empty            #  ground          B  block (alt. look)    =  plank (one-way)
 *   ^  spikes           ~  water (deadly)  x  crate (slash it)     J  spring barrel
 *   o  doubloon         C  checkpoint      G  goal                 P  player start
 *   d  deckhand         p  parrot          <  >  cannon (facing)   b  brute
 *   X  boss             |  boss-arena gate (closes when the fight starts)
 *   S  sign post (shows the next entry of `signs` when you walk past)
 *   m  mast   r  rope   t  torch   y  palm   f  barrel   k  skull  (scenery, no collision)
 */
export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  theme: Theme;
  goal: 'chest' | 'flag';
  /** Seconds; finishing faster than this earns a time bonus. */
  par: number;
  /** Tutorial text for each S in the map, in reading order. */
  signs?: string[];
  rows: string[];
}

export interface Spawn {
  kind: EnemyKind;
  x: number;
  y: number;
  dir: 1 | -1;
}

export interface Level {
  def: LevelDef;
  w: number;
  h: number;
  tiles: Uint8Array;
  spawns: Spawn[];
  coins: { x: number; y: number }[];
  checkpoints: { x: number; y: number }[];
  start: { x: number; y: number };
  goal: Box;
  /** Pixel x of the boss gate, if the level has a boss arena. */
  gateX: number | null;
  /** Scenery for the renderer: char + tile coords. */
  decor: { ch: string; tx: number; ty: number }[];
  signs: { x: number; y: number; text: string }[];
}

const TILE_CODES: Record<string, number> = {
  '#': T.Solid,
  B: T.Solid,
  '=': T.OneWay,
  '^': T.Spike,
  '~': T.Water,
  x: T.Crate,
  J: T.Spring,
};

const ENEMIES: Record<string, EnemyKind> = { d: 'deckhand', p: 'parrot', '<': 'cannon', '>': 'cannon', b: 'brute', X: 'boss' };
const SCENERY = new Set(['m', 'r', 't', 'y', 'f', 'k']);

export function parseLevel(def: LevelDef): Level {
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const tiles = new Uint8Array(w * h);
  const level: Level = {
    def,
    w,
    h,
    tiles,
    spawns: [],
    coins: [],
    checkpoints: [],
    start: { x: 0, y: 0 },
    goal: { x: 0, y: 0, w: 16, h: 16 },
    gateX: null,
    decor: [],
    signs: [],
  };
  let starts = 0;
  let goals = 0;
  for (let ty = 0; ty < h; ty++) {
    const row = def.rows[ty]!;
    for (let tx = 0; tx < w; tx++) {
      const ch = row[tx] ?? '.';
      const px = tx * TILE;
      const py = ty * TILE;
      const code = TILE_CODES[ch];
      if (code !== undefined) {
        tiles[ty * w + tx] = code;
        continue;
      }
      const enemy = ENEMIES[ch];
      if (enemy) {
        level.spawns.push({ kind: enemy, x: px + TILE / 2, y: py + TILE, dir: ch === '>' ? 1 : -1 });
      } else if (ch === 'o') level.coins.push({ x: px + 4, y: py + 4 });
      else if (ch === 'C') level.checkpoints.push({ x: px, y: py });
      else if (ch === 'P') {
        level.start = { x: px + 3, y: py + TILE };
        starts++;
      } else if (ch === 'G') {
        level.goal = { x: px - 4, y: py - 8, w: 24, h: 24 };
        goals++;
      } else if (ch === '|') {
        level.gateX = px;
      } else if (ch === 'S') {
        const text = def.signs?.[level.signs.length];
        if (text === undefined) throw new Error(`Level ${def.id}: sign at ${tx},${ty} has no text`);
        level.signs.push({ x: px, y: py, text });
      } else if (SCENERY.has(ch)) level.decor.push({ ch, tx, ty });
      else if (ch !== '.' && ch !== ' ') throw new Error(`Level ${def.id}: unknown tile '${ch}' at ${tx},${ty}`);
    }
  }
  if (starts !== 1) throw new Error(`Level ${def.id}: needs exactly one P, found ${starts}`);
  if (goals !== 1) throw new Error(`Level ${def.id}: needs exactly one G, found ${goals}`);
  return level;
}
