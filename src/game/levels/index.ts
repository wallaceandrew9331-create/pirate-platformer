import { parseLevel, type Level } from '../level.ts';
import { docks } from './docks.ts';
import { fortress } from './fortress.ts';
import { ship } from './ship.ts';

export const LEVEL_DEFS = [docks, ship, fortress];
export const LEVELS: Level[] = LEVEL_DEFS.map(parseLevel);
