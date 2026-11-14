// Canvas 2D renderer. Draws at a fixed 384x216 and lets CSS scale it up with
// nearest-neighbour filtering, so every shape lands on the pixel grid.
import { VIEW_H, VIEW_W, type Camera } from '../game/camera.ts';
import { TILE } from '../game/constants.ts';
import type { Level, Theme } from '../game/level.ts';
import { T, tileAt } from '../game/tiles.ts';
import type { GameEvent, World } from '../game/types.ts';
import { drawPixelText } from './pixelfont.ts';
import { drawEnemy, drawPlayer, drawPlayerDeath, R } from './sprites.ts';

type Ctx = CanvasRenderingContext2D;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  g: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

interface Palette {
  skyTop: string;
  skyBottom: string;
  far: string;
  near: string;
  ground: string;
  groundTop: string;
  groundDark: string;
  block: string;
  blockLine: string;
  plank: string;
  water: string;
  waterTop: string;
}

const PALETTES: Record<Theme, Palette> = {
  docks: {
    skyTop: '#5fb8e8',
    skyBottom: '#ffe3a8',
    far: '#7fb0c8',
    near: '#4e8f7a',
    ground: '#d8b26a',
    groundTop: '#f3d892',
    groundDark: '#b48a48',
    block: '#8a5a32',
    blockLine: '#6a4022',
    plank: '#a8723e',
    water: '#1f78b4',
    waterTop: '#7fd0f0',
  },
  ship: {
    skyTop: '#2b2d6b',
    skyBottom: '#ff9a5a',
    far: '#4b3f7a',
    near: '#6a4a7a',
    ground: '#6b4428',
    groundTop: '#a0703e',
    groundDark: '#4a2c18',
    block: '#6b4428',
    blockLine: '#4a2c18',
    plank: '#c08a4a',
    water: '#20406e',
    waterTop: '#6aa0d8',
  },
  fortress: {
    skyTop: '#120e1c',
    skyBottom: '#2a2340',
    far: '#1f1a2e',
    near: '#2c2540',
    ground: '#5a5468',
    groundTop: '#7c7590',
    groundDark: '#3e3a4c',
    block: '#4d566a',
    blockLine: '#343a4a',
    plank: '#8a6a4a',
    water: '#145a5a',
    waterTop: '#4fc8b8',
  },
};

export class Renderer {
  readonly ctx: Ctx;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private shake = 0;
  private level: Level | null = null;
  private tilesCanvas: HTMLCanvasElement | null = null;
  private seed = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Pre-draws the level's static tiles into one big offscreen canvas. */
  setLevel(level: Level): void {
    this.level = level;
    this.particles = [];
    this.popups = [];
    const cv = document.createElement('canvas');
    cv.width = level.w * TILE;
    cv.height = level.h * TILE;
    const c = cv.getContext('2d')!;
    const pal = PALETTES[level.def.theme];
    const grid = { w: level.w, h: level.h, tiles: level.tiles };
    for (let ty = 0; ty < level.h; ty++) {
      for (let tx = 0; tx < level.w; tx++) {
        const code = tileAt(grid, tx, ty);
        const ch = level.def.rows[ty]![tx];
        const x = tx * TILE;
        const y = ty * TILE;
        if (code === T.Solid) {
          const exposed = !isSolidCode(tileAt(grid, tx, ty - 1)) && ty > 0;
          if (ch === 'B') drawBlock(c, pal, level.def.theme, x, y, exposed, tx, ty);
          else drawGround(c, pal, level.def.theme, x, y, exposed, tx, ty);
        } else if (code === T.OneWay) {
          drawPlank(c, pal, level.def.theme, x, y, tileAt(grid, tx, ty + 1) === T.Water);
        } else if (code === T.Spike) {
          drawSpikes(c, x, y);
        } else if (code === T.Water) {
          R(c, pal.water, x, y, TILE, TILE);
          if (tileAt(grid, tx, ty - 1) !== T.Water) R(c, shade(pal.water, 1.15), x, y, TILE, 4);
        }
      }
    }
    for (const d of level.decor) drawDecor(c, level.def.theme, d.ch, d.tx * TILE, d.ty * TILE + TILE);
    for (const s of level.signs) drawSign(c, s.x, s.y + TILE);
    this.tilesCanvas = cv;
  }

  /** Turns sim events into particles, popups and screen shake. */
  consume(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'coin':
          this.burst(e.x, e.y, 4, ['#ffe066', '#f2b23a'], 50, 0.4);
          break;
        case 'crate':
          this.burst(e.x, e.y, 10, ['#a8723e', '#6a4022', '#d9a35e'], 110, 0.6, 400);
          break;
        case 'kill':
          this.burst(e.x, e.y, 12, ['#ffffff', '#ffd25a', '#ff8a3a'], 100, 0.5);
          this.popup(e.x, e.y - 10, killText(e.kind), '#ffe066');
          break;
        case 'stomp':
          this.burst(e.x, e.y, 6, ['#ffffff', '#e8e0c8'], 60, 0.3);
          break;
        case 'clang':
          this.burst(e.x, e.y, 6, ['#ffffff', '#fff3a0', '#9fe3ff'], 90, 0.25);
          break;
        case 'reflect':
        case 'parry':
          this.burst(e.x, e.y, 12, ['#fff6b0', '#ffffff', '#ffd25a'], 120, 0.35);
          this.popup(e.x, e.y - 12, 'PARRY!', '#fff6b0');
          this.shake = Math.max(this.shake, 2);
          break;
        case 'repel':
          this.burst(e.x, e.y, 8, ['#2fa84a', '#9bd36a', '#d8352a'], 70, 0.6, 120);
          break;
        case 'hurt':
          this.burst(e.x, e.y, 8, ['#ff4a4a', '#ffffff'], 90, 0.35);
          this.shake = Math.max(this.shake, 4);
          break;
        case 'die':
          this.shake = Math.max(this.shake, 5);
          break;
        case 'fire':
          this.burst(e.x, e.y, 6, ['#d0d0d0', '#a0a0a0', '#ffde59'], 50, 0.5, -20);
          break;
        case 'ballHit':
          this.burst(e.x, e.y, 6, ['#909090', '#ffde59'], 70, 0.3);
          break;
        case 'thud':
          this.burst(e.x, e.y, 14, ['#a0a0a0', '#e0d0b0'], 120, 0.5, 300);
          this.shake = Math.max(this.shake, 6);
          break;
        case 'bossHit':
          this.burst(e.x, e.y, 14, ['#ffffff', '#c8a0ff', '#ffd25a'], 130, 0.4);
          this.shake = Math.max(this.shake, 3);
          break;
        case 'bossDown':
          this.burst(e.x, e.y, 40, ['#ffffff', '#ffd25a', '#c8a0ff', '#ff8a3a'], 180, 1.2, 150);
          this.shake = Math.max(this.shake, 8);
          break;
        case 'checkpoint':
          this.burst(e.x, e.y, 10, ['#ffffff', '#5fe08a'], 80, 0.6);
          this.popup(e.x, e.y - 10, 'CHECKPOINT', '#9ff0b8');
          break;
        case 'oneUp':
          this.popup(e.x, e.y - 14, '1-UP', '#9ff0b8');
          break;
        case 'goal':
          this.burst(e.x, e.y, 30, ['#ffe066', '#ffffff', '#f2b23a'], 140, 1.2, 100);
          break;
        case 'spring':
          this.burst(e.x, e.y, 5, ['#e8d0a0'], 50, 0.3);
          break;
        case 'jump':
          this.burst(e.x, e.y, 3, ['#e8e0c8'], 30, 0.25, 0);
          break;
        default:
          break;
      }
    }
  }

  private burst(x: number, y: number, n: number, colors: string[], speed: number, life: number, g = 200): void {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const s = speed * (0.3 + this.rand() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.3,
        life: life * (0.6 + this.rand() * 0.4),
        max: life,
        color: colors[i % colors.length]!,
        size: this.rand() < 0.3 ? 2 : 1,
        g,
      });
    }
  }

  private popup(x: number, y: number, text: string, color: string): void {
    this.popups.push({ x, y, text, life: 0.9, color });
  }

  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  draw(w: World, cam: Camera, dt: number, time: number): void {
    const level = this.level;
    if (!level || !this.tilesCanvas) return;
    const c = this.ctx;
    const pal = PALETTES[level.def.theme];
    this.shake = Math.max(0, this.shake - dt * 20);
    const sx = this.shake > 0 ? Math.round((this.rand() - 0.5) * this.shake) : 0;
    const sy = this.shake > 0 ? Math.round((this.rand() - 0.5) * this.shake) : 0;
    const cx = Math.round(cam.x) + sx;
    const cy = Math.round(cam.y) + sy;

    drawBackground(c, level.def.theme, pal, cam.x, time);

    c.save();
    c.translate(-cx, -cy);
    c.drawImage(this.tilesCanvas, cx, cy, VIEW_W, VIEW_H, cx, cy, VIEW_W, VIEW_H);
    this.drawDynamicTiles(c, w, pal, cx, cy, time);
    this.drawCheckpoints(c, w, time);
    this.drawGoal(c, w, level, time);
    this.drawCoins(c, w, cx, time);
    for (const e of w.enemies) if (e.x + e.w > cx - 40 && e.x < cx + VIEW_W + 40) drawEnemy(c, e, time);
    for (const b of w.balls) drawBall(c, b.x, b.y, b.w, b.owner === 'player', time);
    if (w.status === 'dying') drawPlayerDeath(c, w.player, w.statusT);
    else drawPlayer(c, w.player, time);
    this.drawParticles(c, dt);
    this.drawPopups(c, dt);
    c.restore();

    if (level.def.theme === 'fortress') drawCaveLight(c, w.player.x - cx, w.player.y - cy);
    if (w.status === 'dying') {
      c.fillStyle = `rgba(20,0,0,${Math.min(0.45, w.statusT * 0.6)})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private drawDynamicTiles(c: Ctx, w: World, pal: Palette, cx: number, cy: number, time: number): void {
    const tx0 = Math.floor(cx / TILE) - 1;
    const tx1 = Math.ceil((cx + VIEW_W) / TILE) + 1;
    const ty0 = Math.max(0, Math.floor(cy / TILE));
    const ty1 = Math.min(w.grid.h - 1, Math.ceil((cy + VIEW_H) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const code = tileAt(w.grid, tx, ty);
        const x = tx * TILE;
        const y = ty * TILE;
        if (code === T.Crate) drawCrate(c, x, y);
        else if (code === T.Spring) drawSpring(c, x, y);
        else if (code === T.Gate) drawGate(c, x, y, time);
        else if (code === T.Water && tileAt(w.grid, tx, ty - 1) !== T.Water) {
          // animated wave crest
          for (let i = 0; i < TILE; i += 2) {
            const h = Math.round(1.5 + Math.sin(time * 3 + (x + i) * 0.25) * 1.5);
            R(c, pal.waterTop, x + i, y - h + 2, 2, h);
          }
        }
      }
    }
  }

  private drawCheckpoints(c: Ctx, w: World, time: number): void {
    for (const cp of w.checkpoints) {
      const x = cp.x + 6;
      const by = cp.y + TILE;
      R(c, '#5a3a22', x, by - 26, 2, 26);
      R(c, '#c99a30', x - 1, by - 27, 4, 2);
      const wave = Math.round(Math.sin(time * 6) * 1);
      const color = cp.active ? '#3fc06a' : '#9a9a9a';
      R(c, color, x + 2, by - 25 + wave, 10, 3);
      R(c, color, x + 2, by - 22, 8, 3);
      if (cp.active) R(c, '#ffffff', x + 4, by - 24 + wave, 2, 2);
    }
  }

  private drawGoal(c: Ctx, w: World, level: Level, time: number): void {
    const g = w.goal;
    const x = Math.round(g.x + 4);
    const by = Math.round(g.y + g.h);
    if (level.def.goal === 'flag') {
      R(c, '#5a3a22', x + 7, by - 46, 3, 46);
      R(c, '#e8b84a', x + 6, by - 48, 5, 3);
      const wv = Math.round(Math.sin(time * 5) * 1.5);
      R(c, '#1a1220', x + 10, by - 44 + wv, 16, 10);
      R(c, '#f2efe6', x + 16, by - 42 + wv, 4, 4); // a skull-and-crossbones-ish emblem
      R(c, '#f2efe6', x + 14, by - 37 + wv, 8, 1);
      return;
    }
    if (!w.goalOpen) return;
    // treasure chest with a golden glow
    const glow = 0.25 + Math.sin(time * 4) * 0.1;
    c.fillStyle = `rgba(255,220,90,${glow})`;
    c.beginPath();
    c.arc(x + 8, by - 8, 16, 0, Math.PI * 2);
    c.fill();
    R(c, '#7a4a22', x, by - 10, 16, 10);
    R(c, '#9a6230', x, by - 14, 16, 5);
    R(c, '#e8b84a', x, by - 10, 16, 1);
    R(c, '#e8b84a', x + 7, by - 11, 3, 4);
    R(c, '#ffe066', x + 2, by - 16, 3, 2);
    R(c, '#ffe066', x + 10, by - 15, 3, 1);
  }

  private drawCoins(c: Ctx, w: World, cx: number, time: number): void {
    for (const coin of w.coins) {
      if (coin.taken || coin.x < cx - 16 || coin.x > cx + VIEW_W + 16) continue;
      const spin = Math.abs(Math.sin(time * 4 + coin.x * 0.05));
      const wpx = Math.max(2, Math.round(2 + spin * 6));
      const x = Math.round(coin.x + 4 - wpx / 2);
      const y = Math.round(coin.y + Math.sin(time * 3 + coin.x) * 1);
      R(c, '#c98a1a', x, y, wpx, 8);
      if (wpx > 2) R(c, '#ffe066', x + 1, y + 1, wpx - 2, 6);
      if (wpx > 4) R(c, '#c98a1a', x + Math.floor(wpx / 2), y + 2, 1, 4);
    }
  }

  private drawParticles(c: Ctx, dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      c.globalAlpha = Math.max(0, Math.min(1, p.life / p.max + 0.2));
      R(c, p.color, Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    c.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private drawPopups(c: Ctx, dt: number): void {
    for (const p of this.popups) {
      p.life -= dt;
      p.y -= 18 * dt;
      c.globalAlpha = Math.min(1, p.life * 2);
      drawPixelText(c, p.text, p.x, p.y - 5, p.color);
    }
    c.globalAlpha = 1;
    this.popups = this.popups.filter((p) => p.life > 0);
  }
}

function killText(kind: string | undefined): string {
  switch (kind) {
    case 'deckhand':
      return '100';
    case 'cannon':
      return '200';
    case 'brute':
      return '300';
    case 'boss':
      return '2000';
    default:
      return '';
  }
}

const isSolidCode = (code: number): boolean => code === T.Solid || code === T.Crate || code === T.Spring;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Cheap deterministic hash for per-tile texture variation. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- tiles
function drawGround(c: Ctx, pal: Palette, theme: Theme, x: number, y: number, exposed: boolean, tx: number, ty: number): void {
  R(c, pal.ground, x, y, TILE, TILE);
  // speckles / stones
  for (let i = 0; i < 4; i++) {
    const hx = Math.floor(hash(tx * 7 + i, ty) * 14);
    const hy = Math.floor(hash(tx, ty * 5 + i) * 14);
    R(c, pal.groundDark, x + hx, y + hy, theme === 'fortress' ? 2 : 1, 1);
  }
  if (theme === 'fortress') {
    // rough stone courses
    R(c, pal.groundDark, x, y + 7, TILE, 1);
    R(c, pal.groundDark, x + (ty % 2 ? 4 : 11), y, 1, 7);
    R(c, pal.groundDark, x + (ty % 2 ? 11 : 4), y + 8, 1, 8);
  }
  if (exposed) {
    R(c, pal.groundTop, x, y, TILE, 4);
    if (theme === 'docks') {
      // sand with a fringe of dune grass here and there
      if (hash(tx, 99) > 0.6) {
        R(c, '#5ea04a', x + 3, y - 3, 1, 3);
        R(c, '#5ea04a', x + 5, y - 2, 1, 2);
        R(c, '#7cc05a', x + 9, y - 3, 1, 3);
      }
    } else if (theme === 'fortress') {
      R(c, '#5a8a5a', x, y, TILE, 1); // a little moss
    }
    R(c, shade(pal.groundTop, 0.85), x, y + 4, TILE, 1);
  }
}

function drawBlock(c: Ctx, pal: Palette, theme: Theme, x: number, y: number, exposed: boolean, tx: number, ty: number): void {
  if (theme === 'fortress') {
    R(c, pal.block, x, y, TILE, TILE);
    R(c, pal.blockLine, x, y + 7, TILE, 1);
    R(c, pal.blockLine, x, y + 15, TILE, 1);
    R(c, pal.blockLine, x + 7, y, 1, 7);
    R(c, pal.blockLine, x + 3, y + 8, 1, 7);
    R(c, shade(pal.block, 1.2), x, y, TILE, 1);
    return;
  }
  // wooden hull or crate-stack planking
  R(c, pal.block, x, y, TILE, TILE);
  for (let i = 0; i < 4; i++) R(c, pal.blockLine, x, y + i * 4 + 3, TILE, 1);
  R(c, pal.blockLine, x + ((tx + ty) % 2 ? 5 : 12), y, 1, TILE);
  if (hash(tx, ty) > 0.85) R(c, '#c9a050', x + 8, y + 6, 1, 1); // a nail
  if (exposed) {
    R(c, pal.groundTop, x, y, TILE, 3);
    R(c, shade(pal.groundTop, 0.75), x, y + 3, TILE, 1);
    if (theme === 'ship') R(c, '#3a2414', x + (tx % 2) * 8, y, 1, 3);
  }
}

function drawPlank(c: Ctx, pal: Palette, theme: Theme, x: number, y: number, overWater: boolean): void {
  R(c, pal.plank, x, y, TILE, 4);
  R(c, shade(pal.plank, 0.7), x, y + 4, TILE, 1);
  R(c, shade(pal.plank, 0.7), x + 7, y, 1, 4);
  if (overWater || theme === 'docks') {
    R(c, '#5a3a22', x + 2, y + 5, 3, overWater ? 27 : 6); // pier posts
  } else if (theme === 'ship') {
    R(c, '#d8c8a0', x + 3, y + 5, 1, 4); // rigging ropes
    R(c, '#d8c8a0', x + 12, y + 5, 1, 4);
  } else {
    R(c, '#5a3a22', x + 1, y + 4, 2, 3);
    R(c, '#5a3a22', x + 13, y + 4, 2, 3);
  }
}

function drawSpikes(c: Ctx, x: number, y: number): void {
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 4;
    R(c, '#9aa1ac', sx + 1, y + 10, 2, 6);
    R(c, '#c5ccd6', sx + 1, y + 8, 1, 3);
    R(c, '#5a6070', sx, y + 14, 4, 2);
  }
}

function drawCrate(c: Ctx, x: number, y: number): void {
  R(c, '#a8723e', x + 1, y + 1, 14, 14);
  R(c, '#6a4022', x + 1, y + 1, 14, 2);
  R(c, '#6a4022', x + 1, y + 13, 14, 2);
  R(c, '#6a4022', x + 1, y + 1, 2, 14);
  R(c, '#6a4022', x + 13, y + 1, 2, 14);
  for (let i = 0; i < 10; i++) R(c, '#7a4a28', x + 3 + i, y + 3 + i, 1, 1);
  R(c, '#ffe066', x + 7, y + 7, 2, 2);
}

function drawSpring(c: Ctx, x: number, y: number): void {
  R(c, '#7a4a28', x + 2, y + 3, 12, 13);
  R(c, '#a8723e', x + 3, y + 3, 10, 13);
  R(c, '#8d939e', x + 2, y + 5, 12, 1);
  R(c, '#8d939e', x + 2, y + 12, 12, 1);
  R(c, '#e84a4a', x + 1, y + 1, 14, 3);
  R(c, '#ff8a7a', x + 2, y + 1, 12, 1);
}

function drawGate(c: Ctx, x: number, y: number, time: number): void {
  R(c, '#3a3040', x + 2, y, 12, TILE);
  for (let i = 0; i < 3; i++) R(c, '#8d939e', x + 3 + i * 4, y, 2, TILE);
  if (Math.floor(time * 2) % 2) R(c, '#c8323c', x + 6, y + 6, 4, 4);
}

function drawBall(c: Ctx, x: number, y: number, s: number, reflected: boolean, time: number): void {
  if (reflected) {
    c.fillStyle = `rgba(255,230,120,${0.45 + Math.sin(time * 30) * 0.2})`;
    c.beginPath();
    c.arc(x + s / 2, y + s / 2, s / 2 + 3, 0, Math.PI * 2);
    c.fill();
  }
  // a pale rim so the ball reads against dark caves and hulls
  R(c, '#d8d8e8', Math.round(x), Math.round(y) - 1, s, s + 2);
  R(c, '#d8d8e8', Math.round(x) - 1, Math.round(y), s + 2, s);
  R(c, '#1a1a20', Math.round(x) + 1, Math.round(y), s - 2, s);
  R(c, '#1a1a20', Math.round(x), Math.round(y) + 1, s, s - 2);
  R(c, '#6a6a78', Math.round(x) + 1, Math.round(y) + 1, 2, 2);
}

function drawSign(c: Ctx, x: number, by: number): void {
  R(c, '#5a3a22', x + 7, by - 10, 2, 10);
  R(c, '#c08a4a', x + 1, by - 16, 14, 8);
  R(c, '#8a5a32', x + 1, by - 16, 14, 1);
  R(c, '#5a3a22', x + 4, by - 13, 8, 1);
  R(c, '#5a3a22', x + 4, by - 11, 6, 1);
}

function drawDecor(c: Ctx, theme: Theme, ch: string, x: number, by: number): void {
  switch (ch) {
    case 'y': {
      // palm tree: a leaning trunk and drooping fronds
      let topX = x + 6;
      for (let i = 0; i < 8; i++) {
        topX = x + 6 + Math.round(Math.sin(i * 0.35) * 4);
        R(c, i % 2 ? '#9a7a46' : '#8a6a3a', topX, by - 6 - i * 5, 4, 6);
      }
      const ty = by - 44;
      for (const [dir, lift, len] of [[1, 0, 6], [-1, 0, 6], [1, -3, 4], [-1, -3, 4], [1, 2, 5], [-1, 2, 5]] as const) {
        for (let k = 0; k < len; k++) R(c, k % 2 ? '#2f8a40' : '#3fa04e', topX + 1 + dir * k * 3, ty + lift + Math.round(k * k * 0.3), 3, 2);
      }
      R(c, '#6a4a2a', topX, ty + 2, 2, 2); // coconuts
      R(c, '#6a4a2a', topX + 3, ty + 3, 2, 2);
      break;
    }
    case 'f': // barrel
      R(c, '#8a5a32', x + 3, by - 12, 10, 12);
      R(c, '#5a3a22', x + 3, by - 10, 10, 1);
      R(c, '#5a3a22', x + 3, by - 3, 10, 1);
      R(c, '#a8723e', x + 5, by - 12, 2, 12);
      break;
    case 'm': // mast with a furled sail
      R(c, '#6a4428', x + 6, by - 150, 5, 150);
      R(c, '#8a5a32', x - 22, by - 120, 50, 3);
      R(c, '#efe6d0', x - 20, by - 117, 46, 6);
      R(c, '#8a5a32', x - 16, by - 70, 38, 3);
      R(c, '#efe6d0', x - 14, by - 67, 34, 5);
      break;
    case 't': // wall torch
      R(c, '#5a3a22', x + 7, by - 8, 2, 7);
      R(c, '#ff9a3a', x + 6, by - 12, 4, 4);
      R(c, '#ffe066', x + 7, by - 11, 2, 2);
      break;
    case 'k': // skull on a stake
      R(c, '#5a3a22', x + 7, by - 10, 2, 10);
      R(c, '#e8e0c8', x + 4, by - 16, 8, 6);
      R(c, '#1a1010', x + 5, by - 14, 2, 2);
      R(c, '#1a1010', x + 9, by - 14, 2, 2);
      break;
    default:
      void theme;
  }
}

// ---------------------------------------------------------------- backgrounds
function drawBackground(c: Ctx, theme: Theme, pal: Palette, camX: number, time: number): void {
  const g = c.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(1, pal.skyBottom);
  c.fillStyle = g;
  c.fillRect(0, 0, VIEW_W, VIEW_H);

  if (theme === 'docks' || theme === 'ship') {
    // sun or setting sun
    c.fillStyle = theme === 'docks' ? '#fff4c0' : '#ffcf7a';
    c.beginPath();
    c.arc(300 - camX * 0.02, theme === 'docks' ? 46 : 120, theme === 'docks' ? 18 : 26, 0, Math.PI * 2);
    c.fill();
    // drifting clouds
    for (let i = 0; i < 5; i++) {
      const x = ((i * 113 - camX * 0.1 + time * 4) % 520) - 60;
      const y = 20 + ((i * 37) % 60);
      c.fillStyle = theme === 'docks' ? 'rgba(255,255,255,0.85)' : 'rgba(255,190,170,0.5)';
      c.fillRect(Math.round(x), y, 40, 6);
      c.fillRect(Math.round(x) + 8, y - 4, 22, 5);
    }
    // distant islands
    c.fillStyle = pal.far;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 190 - camX * 0.2) % 1140) - 100;
      c.beginPath();
      c.ellipse(Math.round(x), 150, 70, 26 + (i % 3) * 8, 0, Math.PI, 0);
      c.fill();
    }
    // the sea
    c.fillStyle = theme === 'docks' ? '#3a98c8' : '#3a4a8a';
    c.fillRect(0, 150, VIEW_W, VIEW_H - 150);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 14; i++) {
      const x = ((i * 61 - camX * 0.35 + Math.sin(time + i) * 3) % 420) - 20;
      c.fillRect(Math.round(x), 158 + (i % 4) * 9, 10, 1);
    }
    if (theme === 'ship') {
      // far-off ships on the horizon: a hull and two sails in silhouette
      for (let i = 0; i < 3; i++) {
        const x = Math.round(((i * 260 - camX * 0.25) % 780) - 60);
        c.fillStyle = '#2a2050';
        c.fillRect(x, 144, 36, 5);
        c.fillRect(x + 3, 149, 30, 2);
        c.fillRect(x + 12, 118, 2, 26);
        c.fillRect(x + 24, 124, 2, 20);
        c.beginPath();
        c.moveTo(x + 14, 120);
        c.lineTo(x + 22, 141);
        c.lineTo(x + 14, 141);
        c.fill();
        c.beginPath();
        c.moveTo(x + 26, 126);
        c.lineTo(x + 33, 141);
        c.lineTo(x + 26, 141);
        c.fill();
        c.fillRect(x + 11, 116, 6, 2);
      }
    }
    return;
  }
  // fortress: layered cave rock
  for (let layer = 0; layer < 2; layer++) {
    c.fillStyle = layer ? pal.near : pal.far;
    const par = layer ? 0.4 : 0.2;
    for (let i = 0; i < 14; i++) {
      const x = ((i * 47 - camX * par) % 660) - 40;
      const h = 30 + ((i * 53) % 50) + layer * 20;
      c.fillRect(Math.round(x), 0, 30, h); // stalactites
      c.fillRect(Math.round(x) + 10, h, 10, 8);
      c.fillRect(Math.round(x) + 5, VIEW_H - h * 0.8, 36, h); // stalagmites
    }
  }
  // glinting gold far in the dark
  for (let i = 0; i < 10; i++) {
    const x = ((i * 89 - camX * 0.3) % 600) - 40;
    if (Math.sin(time * 2 + i * 3) > 0.7) R(c, '#ffe066', Math.round(x), 60 + ((i * 29) % 90), 1, 1);
  }
}

function drawCaveLight(c: Ctx, px: number, py: number): void {
  const g = c.createRadialGradient(px + 5, py + 7, 30, px + 5, py + 7, 220);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(5,3,12,0.55)');
  c.fillStyle = g;
  c.fillRect(0, 0, VIEW_W, VIEW_H);
}
