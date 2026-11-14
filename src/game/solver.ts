// A beam-search "speedrunner" that plays a level through the real sim,
// headless. It is not part of the game: tests and tools/solve.ts use it to
// prove every level can be finished with the real physics and enemies, so a
// level edit that adds an impossible jump fails CI.
import { DT } from './constants.ts';
import type { Level } from './level.ts';
import type { Input, World } from './types.ts';
import { createWorld, step } from './world.ts';

/** Macro-actions: an input held for a few frames. `press` releases jump on frame 0 so a fresh jump can start. */
interface Macro {
  name: string;
  input: Input;
  press?: boolean;
}

const I = (o: Partial<Input>): Input => ({ left: false, right: false, jump: false, slash: false, parry: false, ...o });

const MACROS: Macro[] = [
  { name: 'R', input: I({ right: true }) },
  { name: 'RJ', input: I({ right: true, jump: true }), press: true },
  { name: 'RJh', input: I({ right: true, jump: true }) },
  { name: 'L', input: I({ left: true }) },
  { name: 'LJ', input: I({ left: true, jump: true }), press: true },
  { name: 'LJh', input: I({ left: true, jump: true }) },
  { name: 'J', input: I({ jump: true }), press: true },
  { name: 'Jh', input: I({ jump: true }) },
  { name: '-', input: I({}) },
  { name: 'RS', input: I({ right: true, slash: true }), press: true },
  { name: 'LS', input: I({ left: true, slash: true }), press: true },
  { name: 'S', input: I({ slash: true }), press: true },
  { name: 'P', input: I({ parry: true }), press: true },
  { name: 'RP', input: I({ right: true, parry: true }), press: true },
  { name: 'LP', input: I({ left: true, parry: true }), press: true },
];

interface Node {
  world: World;
  inputs: Input[];
  fitness: number;
}

export interface SolveOptions {
  beam?: number;
  frames?: number;
  maxSeconds?: number;
}

export interface SolveResult {
  won: boolean;
  /** Per-frame inputs that finish the level (or the best attempt). */
  inputs: Input[];
  time: number;
  hearts: number;
  bestX: number;
  expanded: number;
}

function fitness(w: World): number {
  if (w.status === 'won') return 1e9 - w.time * 100;
  const p = w.player;
  let f = p.x + p.hearts * 120;
  if (w.boss === 'fighting') {
    const boss = w.enemies.find((e) => e.kind === 'boss');
    f += 3000 + (boss ? (6 - boss.hp) * 600 : 4000);
  }
  if (w.boss === 'defeated') f += 8000 + p.x;
  // Small push to keep moving rather than dither.
  f -= w.time * 2;
  return f;
}

function key(w: World): string {
  const p = w.player;
  const boss = w.enemies.find((e) => e.kind === 'boss');
  return [
    Math.round(p.x / 3),
    Math.round(p.y / 3),
    Math.round(p.vx / 40),
    Math.round(p.vy / 60),
    p.hearts,
    w.enemies.length,
    boss ? boss.hp : -1,
    w.boss,
  ].join(',');
}

export function solve(level: Level, opts: SolveOptions = {}): SolveResult {
  const beam = opts.beam ?? 220;
  const frames = opts.frames ?? 6;
  const maxSteps = Math.ceil((opts.maxSeconds ?? 300) / (frames * DT));
  let nodes: Node[] = [{ world: createWorld(level), inputs: [], fitness: 0 }];
  let best: Node = nodes[0]!;
  let expanded = 0;
  for (let depth = 0; depth < maxSteps; depth++) {
    const next = new Map<string, Node>();
    for (const n of nodes) {
      for (const m of MACROS) {
        const w = structuredClone(n.world);
        const inputs: Input[] = [];
        let dead = false;
        for (let f = 0; f < frames; f++) {
          const inp = m.press && f === 0 ? { ...m.input, jump: false, slash: false, parry: false } : m.input;
          step(w, level, inp);
          inputs.push(inp);
          if (w.status === 'dying' || w.status === 'gameover') {
            dead = true;
            break;
          }
          if (w.status === 'won') break;
        }
        expanded++;
        if (dead) continue;
        const child: Node = { world: w, inputs: n.inputs.concat(inputs), fitness: fitness(w) };
        if (w.status === 'won') {
          return { won: true, inputs: child.inputs, time: w.time, hearts: w.player.hearts, bestX: w.player.x, expanded };
        }
        const k = key(w);
        const prev = next.get(k);
        if (!prev || prev.fitness < child.fitness) next.set(k, child);
      }
    }
    nodes = [...next.values()].sort((a, b) => b.fitness - a.fitness).slice(0, beam);
    if (nodes.length === 0) break;
    if (nodes[0]!.fitness > best.fitness) best = nodes[0]!;
  }
  return { won: false, inputs: best.inputs, time: best.world.time, hearts: best.world.player.hearts, bestX: best.world.player.x, expanded };
}
