import './style.css';
import { followCamera, VIEW_H, VIEW_W, type Camera } from './game/camera.ts';
import { BOSS, DT, PLAYER, START_LIVES, TILE } from './game/constants.ts';
import { LEVELS } from './game/levels/index.ts';
import { centerX } from './game/physics.ts';
import type { Carry, Input, World } from './game/types.ts';
import { carryFrom, createWorld, step } from './game/world.ts';
import { Sound } from './ui/audio.ts';
import { Controls } from './ui/input.ts';
import { Renderer } from './ui/render.ts';

type Mode = 'title' | 'intro' | 'playing' | 'paused' | 'complete' | 'gameover' | 'victory';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;
const stage = $<HTMLDivElement>('#stage');
const overlay = $<HTMLDivElement>('#overlay');
const renderer = new Renderer($<HTMLCanvasElement>('#game'));
const controls = new Controls($('#touch'));
const sound = new Sound();

let mode: Mode = 'title';
let levelIndex = 0;
let world: World = createWorld(LEVELS[0]!);
let levelStart: Carry = { lives: START_LIVES, score: 0, doubloons: 0 };
let cam: Camera = { x: 0, y: 0 };
let acc = 0;
let clock = 0;
let modeT = 0;
/** Dev/playtest: a recorded input track that replaces the controls. */
let replay: Input[] | null = null;
let replayAt = 0;

// ---------------------------------------------------------------- layout
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

function layout(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const portrait = vh > vw;
  // In portrait on a phone, the game sits at the top and the pad below it.
  const maxH = portrait && document.body.classList.contains('touch') ? vh * 0.6 : vh;
  const scale = Math.min(vw / VIEW_W, maxH / VIEW_H);
  stage.style.width = `${Math.floor(VIEW_W * scale)}px`;
  stage.style.height = `${Math.floor(VIEW_H * scale)}px`;
  $('#app').style.alignItems = portrait && document.body.classList.contains('touch') ? 'flex-start' : 'center';
  $('#app').style.paddingTop = portrait && document.body.classList.contains('touch') ? '14vh' : '0';
  document.documentElement.style.setProperty('--stage-bottom', `${stage.getBoundingClientRect().bottom}px`);
}
window.addEventListener('resize', layout);
layout();

// ---------------------------------------------------------------- best score
const BEST_KEY = 'brinebound-best';
function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function saveBest(v: number): void {
  try {
    if (v > loadBest()) localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* storage blocked: fine */
  }
}

// ---------------------------------------------------------------- screens
function show(html: string, clear = false): void {
  overlay.innerHTML = html;
  overlay.classList.add('show');
  overlay.classList.toggle('clear', clear);
}
function hide(): void {
  overlay.classList.remove('show', 'clear');
  overlay.innerHTML = '';
}

const CONTROLS_HTML = `
  <div class="controls-grid">
    <span><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd></span><span>Run</span>
    <span><kbd>Space</kbd> <kbd>W</kbd> <kbd>Z</kbd></span><span>Jump (hold = higher)</span>
    <span><kbd>X</kbd> / <kbd>J</kbd></span><span>Slash</span>
    <span><kbd>C</kbd> / <kbd>K</kbd></span><span>Parry: time it to deflect</span>
    <span><kbd>Esc</kbd> <kbd>M</kbd></span><span>Pause, mute</span>
  </div>`;

function titleScreen(): void {
  mode = 'title';
  sound.stopMusic();
  levelIndex = 0;
  world = createWorld(LEVELS[0]!);
  renderer.setLevel(LEVELS[0]!);
  cam = { x: 0, y: LEVELS[0]!.h * TILE - VIEW_H };
  const best = loadBest();
  show(`<div class="card">
    <h1>BRINEBOUND</h1>
    <p class="sub">Three islands. One hoard. Bring a sword.</p>
    ${isTouch ? '<p class="sub">◀ ▶ to run · JUMP · SLASH · PARRY</p>' : CONTROLS_HTML}
    <button class="btn" data-go="start">Set sail</button>
    ${best ? `<div class="fine">Best score: ${best.toLocaleString()}</div>` : ''}
    ${
      isTouch
        ? window.innerHeight > window.innerWidth
          ? '<div class="fine">Tip: turn your phone sideways for a bigger view.</div>'
          : ''
        : '<div class="fine">Gamepad works too: A jump · X slash · B parry · Start pause</div>'
    }
  </div>`);
}

function startLevel(i: number, carry: Carry): void {
  levelIndex = i;
  levelStart = { ...carry };
  const level = LEVELS[i]!;
  world = createWorld(level, carry);
  renderer.setLevel(level);
  cam = followCamera({ x: 0, y: level.h * TILE }, centerX(world.player), world.player.y, 1, level.w, level.h, 10);
  acc = 0;
  replayAt = 0;
  mode = 'intro';
  modeT = 0;
  $('#level-name').textContent = `${level.def.id} · ${level.def.name}`;
  show(
    `<div class="card level-card"><div class="num">LEVEL ${level.def.id} OF ${LEVELS.length}</div><h2>${level.def.name}</h2><div class="sub">${level.def.subtitle}</div></div>`,
    true,
  );
  sound.startMusic(level.def.theme);
}

function completeScreen(): void {
  mode = 'complete';
  const t = world.tally!;
  const last = levelIndex === LEVELS.length - 1;
  if (last) return victoryScreen();
  show(`<div class="card">
    <h2>${LEVELS[levelIndex]!.def.goal === 'flag' ? 'Flag claimed!' : 'Treasure found!'}</h2>
    <p class="sub">${LEVELS[levelIndex]!.def.name} complete</p>
    <table>
      <tr><td>Time</td><td>${formatTime(t.time)}</td></tr>
      <tr><td>Goal</td><td>+${t.goalBonus}</td></tr>
      <tr><td>Time bonus</td><td>+${t.timeBonus}</td></tr>
      <tr><td>Hearts left</td><td>+${t.heartBonus}</td></tr>
      <tr><td>Doubloons</td><td>${world.doubloons}</td></tr>
      <tr class="total"><td>Score</td><td>${world.score.toLocaleString()}</td></tr>
    </table>
    <button class="btn" data-go="next">Next level</button>
  </div>`);
}

function victoryScreen(): void {
  mode = 'victory';
  saveBest(world.score);
  sound.startMusic('docks');
  show(`<div class="card">
    <h1>THE HOARD IS YOURS</h1>
    <p class="sub">Captain Grimtide is beaten and Skullrock's gold is yours.</p>
    <table>
      <tr><td>Last level time</td><td>${formatTime(world.tally!.time)}</td></tr>
      <tr><td>Lives left</td><td>${world.lives}</td></tr>
      <tr class="total"><td>Final score</td><td>${world.score.toLocaleString()}</td></tr>
    </table>
    <button class="btn" data-go="title">Sail again</button>
    <div class="fine">Best score: ${loadBest().toLocaleString()}</div>
  </div>`);
}

function gameOverScreen(): void {
  mode = 'gameover';
  saveBest(world.score);
  show(`<div class="card">
    <h2>Lost at sea</h2>
    <p class="sub">Out of lives on ${LEVELS[levelIndex]!.def.name}. Score ${world.score.toLocaleString()}</p>
    <button class="btn" data-go="retry">Try this level again</button>
    <button class="btn secondary" data-go="title">Title</button>
  </div>`);
}

function pauseScreen(): void {
  if (mode !== 'playing') return;
  mode = 'paused';
  show(`<div class="card">
    <h2>Paused</h2>
    ${isTouch ? '' : CONTROLS_HTML}
    <button class="btn" data-go="resume">Resume</button>
    <button class="btn secondary" data-go="restart">Restart level</button>
    <button class="btn secondary" data-go="title">Quit</button>
  </div>`);
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

function go(action: string): void {
  sound.unlock();
  sound.ui();
  switch (action) {
    case 'start':
      startLevel(0, { lives: START_LIVES, score: 0, doubloons: 0 });
      break;
    case 'next':
      startLevel(levelIndex + 1, carryFrom(world));
      break;
    case 'retry':
      startLevel(levelIndex, { ...levelStart, lives: START_LIVES });
      break;
    case 'restart':
      startLevel(levelIndex, levelStart);
      break;
    case 'resume':
      mode = 'playing';
      hide();
      break;
    case 'title':
      titleScreen();
      break;
  }
}

overlay.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
  if (b) go(b.dataset.go!);
});

controls.onMenu((k) => {
  sound.unlock();
  if (k === 'mute') return toggleMute();
  if (k === 'pause') {
    if (mode === 'playing') pauseScreen();
    else if (mode === 'paused') go('resume');
    return;
  }
  // confirm: press the primary button on whatever card is up
  if (mode === 'intro' && modeT > 0.3) return beginPlay();
  if (mode === 'title' || mode === 'complete' || mode === 'gameover' || mode === 'victory' || mode === 'paused') {
    const primary = overlay.querySelector<HTMLElement>('.btn[data-go]');
    if (primary) go(primary.dataset.go!);
  }
});

$('#pause').addEventListener('click', () => (mode === 'playing' ? pauseScreen() : mode === 'paused' ? go('resume') : undefined));
$('#mute').addEventListener('click', toggleMute);
function toggleMute(): void {
  sound.setMuted(!sound.muted);
  $('#mute').classList.toggle('off', sound.muted);
}
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });
// The first touch anywhere reveals the on-screen pad (e.g. a touch laptop).
window.addEventListener('touchstart', () => {
  if (!document.body.classList.contains('touch')) {
    document.body.classList.add('touch');
    layout();
  }
});

function beginPlay(): void {
  mode = 'playing';
  hide();
}

// ---------------------------------------------------------------- HUD
let hudCache = '';
function updateHud(): void {
  const p = world.player;
  const level = LEVELS[levelIndex]!;
  const boss = world.enemies.find((e) => e.kind === 'boss');
  const sign = level.signs.find((s) => Math.abs(s.x + 8 - centerX(p)) < 28 && Math.abs(s.y - p.y) < 40);
  const key = [p.hearts, world.lives, world.doubloons, world.score, world.boss, boss?.hp, sign?.text, mode].join('|');
  if (key === hudCache) return;
  hudCache = key;
  $('#hearts').innerHTML = Array.from({ length: PLAYER.maxHearts }, (_, i) => `<i class="heart${i < p.hearts ? '' : ' empty'}"></i>`).join('');
  $('#lives').textContent = String(world.lives);
  $('#coins').textContent = String(world.doubloons);
  $('#score').textContent = world.score.toLocaleString();
  const bossBar = $('#bossbar');
  bossBar.hidden = world.boss !== 'fighting';
  if (boss) $('#boss-hp').style.width = `${(boss.hp / BOSS.hp) * 100}%`;
  const signEl = $('#sign');
  const showSign = !!sign && (mode === 'playing' || mode === 'intro');
  signEl.hidden = !showSign;
  if (sign) signEl.textContent = sign.text;
}

// ---------------------------------------------------------------- loop
const IDLE: Input = { left: false, right: false, jump: false, slash: false, parry: false };
/** Dev/playtest: input forced by automation instead of the real controls. */
let forced: Input | null = null;

/** Advances screens and the fixed-step sim by dt seconds of wall time, then draws. */
function update(dt: number): void {
  clock += dt;
  modeT += dt;
  const level = LEVELS[levelIndex]!;
  const live = forced ?? controls.read();
  if (mode === 'intro' && modeT > 1.8) beginPlay();
  if (mode === 'intro' && (live.jump || live.slash) && modeT > 0.5 && !replay) beginPlay();

  if (mode === 'playing') {
    acc += dt;
    while (acc >= DT) {
      const inp = replay ? (replay[replayAt++] ?? IDLE) : live;
      step(world, level, inp);
      renderer.consume(world.events);
      sound.play(world.events);
      acc -= DT;
    }
    if (world.status === 'won' && world.statusT > 1.4) completeScreen();
    else if (world.status === 'gameover' && world.statusT > 1.0) gameOverScreen();
  }
  if (world.status !== 'dying') cam = followCamera(cam, centerX(world.player), world.player.y, world.player.facing, level.w, level.h, dt);
  renderer.draw(world, cam, mode === 'paused' ? 0 : dt, clock);
  updateHud();
}

let last = performance.now();
function frame(now: number): void {
  update(Math.min(0.1, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}

titleScreen();
requestAnimationFrame(frame);

// ---------------------------------------------------------------- dev hooks
// Used for playtesting from the browser console / automation in dev builds.
if (import.meta.env.DEV) {
  const decode = (s: string): Input[] =>
    [...s.trim()].map((ch) => {
      const v = ch.charCodeAt(0) - 48;
      return { left: !!(v & 1), right: !!(v & 2), jump: !!(v & 4), slash: !!(v & 8), parry: !!(v & 16) };
    });
  Object.assign(window, {
    __brine: {
      world: () => world,
      mode: () => mode,
      start: (i: number) => {
        sound.unlock();
        startLevel(i, { lives: START_LIVES, score: 0, doubloons: 0 });
        beginPlay();
      },
      /** Plays a solver recording (tools/out/levelN.txt from `npm run solve -- --save`). */
      replay: async (i: number, untilSeconds = Infinity) => {
        const txt = await (await fetch(`/tools/out/level${i + 1}.txt`)).text();
        const all = decode(txt);
        replay = all.slice(0, Math.round(untilSeconds / DT));
        startLevel(i, { lives: START_LIVES, score: 0, doubloons: 0 });
        beginPlay();
        return replay.length;
      },
      stopReplay: () => {
        replay = null;
      },
      /** Steps the game synchronously (works even when the tab is hidden). */
      advance: (secs: number, input?: Partial<Input>) => {
        forced = input ? { ...IDLE, ...input } : null;
        for (let i = 0; i < Math.round(secs / DT); i++) update(DT);
        forced = null;
        return { t: +world.time.toFixed(2), x: Math.round(world.player.x), hearts: world.player.hearts, status: world.status, mode };
      },
      confirm: () => {
        const b = overlay.querySelector<HTMLElement>('.btn[data-go]');
        if (b) go(b.dataset.go!);
      },
    },
  });
}
