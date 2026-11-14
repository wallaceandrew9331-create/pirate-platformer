import { DT } from '../src/game/constants.ts';
import { parseLevel, type Level } from '../src/game/level.ts';
import { NO_INPUT, type Input, type World } from '../src/game/types.ts';
import { createWorld, step } from '../src/game/world.ts';

/** Builds a test level from a small ASCII map (P and G are added if missing). */
export function makeLevel(rows: string[], extra: { signs?: string[] } = {}): Level {
  return parseLevel({ id: 99, name: 'Test', subtitle: '', theme: 'docks', goal: 'chest', par: 60, rows, ...extra });
}

export function makeWorld(rows: string[]): { level: Level; world: World } {
  const level = makeLevel(rows);
  return { level, world: createWorld(level) };
}

export const press = (o: Partial<Input>): Input => ({ ...NO_INPUT, ...o });

/** Steps the world n frames with the same input. */
export function run(level: Level, w: World, frames: number, input: Partial<Input> = {}): void {
  const inp = press(input);
  for (let i = 0; i < frames; i++) step(w, level, inp);
}

export const seconds = (s: number): number => Math.round(s / DT);

/** Steps until the predicate holds (or fails after maxFrames). */
export function runUntil(level: Level, w: World, pred: (w: World) => boolean, input: Partial<Input> = {}, maxFrames = 600): number {
  const inp = press(input);
  for (let i = 0; i < maxFrames; i++) {
    if (pred(w)) return i;
    step(w, level, inp);
  }
  throw new Error('runUntil: condition never became true');
}

/** A flat test arena: floor at row 8 (y = 128), 40 tiles wide. */
export function flat(middle = '', at = 6): string[] {
  const W = 40;
  const row = (s: string): string => s.padEnd(W, '.');
  const rows = Array.from({ length: 10 }, () => row(''));
  rows[7] = row('.P' + '.'.repeat(Math.max(0, at - 2)) + middle).slice(0, W - 2) + '.G';
  rows[8] = '#'.repeat(W);
  rows[9] = '#'.repeat(W);
  return rows;
}
