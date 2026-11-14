// Proves every level can be finished: a beam search plays each one through
// the real sim and prints how it went. `npm run solve [-- levelId] [--save]`
import { writeFileSync, mkdirSync } from 'node:fs';
import { LEVELS } from '../src/game/levels/index.ts';
import { solve } from '../src/game/solver.ts';

const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const only = ids[0] ?? null;
const save = process.argv.includes('--save');
for (const level of LEVELS) {
  if (only !== null && level.def.id !== only) continue;
  const t0 = performance.now();
  const r = solve(level);
  const ms = Math.round(performance.now() - t0);
  console.log(
    `${level.def.id} ${level.def.name.padEnd(16)} ${r.won ? 'BEATEN' : 'STUCK '} time ${r.time.toFixed(1)}s hearts ${r.hearts} ` +
      `reached x=${Math.round(r.bestX)}/${level.w * 16} (${r.expanded} sims, ${ms} ms)`,
  );
  if (save) {
    mkdirSync('tools/out', { recursive: true });
    // Compact: one char per frame, bit flags L R J S P.
    const enc = r.inputs.map((i) => String.fromCharCode(48 + (+i.left | (+i.right << 1) | (+i.jump << 2) | (+i.slash << 3) | (+i.parry << 4)))).join('');
    writeFileSync(`tools/out/level${level.def.id}.txt`, enc);
  }
}
