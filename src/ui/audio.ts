// All sound is synthesised with WebAudio: short oscillator and noise blips
// for effects, and a small step sequencer playing an original jig.
import type { GameEvent } from '../game/types.ts';

type Wave = OscillatorType;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private nextNote = 0;
  private stepIndex = 0;
  private song: Song = SONGS.docks;
  muted = false;

  /** Browsers only allow audio after a user gesture; call from one. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, wave: Wave, vol: number, slideTo?: number, when = 0, out?: AudioNode): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(out ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, freq: number, type: BiquadFilterType = 'bandpass', when = 0): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noise) return;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(events: GameEvent[]): void {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          this.tone(260, 0.12, 'square', 0.08, 520);
          break;
        case 'spring':
          this.tone(180, 0.3, 'triangle', 0.18, 900);
          break;
        case 'slash':
          this.hiss(0.09, 0.25, 3200, 'highpass');
          break;
        case 'parryStart':
          this.hiss(0.05, 0.08, 6000, 'highpass');
          break;
        case 'parry':
        case 'reflect':
          this.tone(1320, 0.25, 'triangle', 0.2);
          this.tone(1980, 0.3, 'sine', 0.12, undefined, 0.03);
          break;
        case 'clang':
          this.tone(840, 0.18, 'square', 0.08, 700);
          this.tone(2210, 0.22, 'triangle', 0.08);
          break;
        case 'kill':
          this.tone(520, 0.1, 'square', 0.1, 180);
          this.hiss(0.12, 0.15, 900);
          break;
        case 'stomp':
          this.tone(320, 0.12, 'square', 0.12, 90);
          break;
        case 'bounce':
          this.tone(200, 0.12, 'triangle', 0.15, 420);
          break;
        case 'repel':
          this.tone(1200, 0.08, 'square', 0.06, 1800);
          this.tone(1500, 0.08, 'square', 0.05, 2200, 0.06);
          break;
        case 'squawk':
          this.tone(1700, 0.12, 'sawtooth', 0.05, 1100);
          break;
        case 'hurt':
          this.tone(400, 0.3, 'sawtooth', 0.12, 110);
          break;
        case 'die':
          [523, 392, 330, 262].forEach((f, i) => this.tone(f, 0.18, 'square', 0.1, undefined, i * 0.14));
          break;
        case 'coin':
          this.tone(988, 0.06, 'square', 0.06);
          this.tone(1319, 0.12, 'square', 0.06, undefined, 0.05);
          break;
        case 'oneUp':
          [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, 'square', 0.07, undefined, i * 0.07));
          break;
        case 'crate':
          this.hiss(0.18, 0.3, 700);
          break;
        case 'checkpoint':
          [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.12, undefined, i * 0.07));
          break;
        case 'fire':
          this.hiss(0.35, 0.4, 260, 'lowpass');
          this.tone(110, 0.25, 'sine', 0.25, 50);
          break;
        case 'ballHit':
          this.hiss(0.15, 0.2, 400, 'lowpass');
          break;
        case 'windup':
          this.tone(150, 0.3, 'sawtooth', 0.06, 220);
          break;
        case 'swing':
          this.hiss(0.15, 0.25, 1200);
          break;
        case 'thud':
          this.tone(80, 0.4, 'sine', 0.35, 40);
          this.hiss(0.3, 0.3, 300, 'lowpass');
          break;
        case 'bossStart':
          this.tone(110, 0.6, 'sawtooth', 0.12, 55);
          this.startMusic('boss');
          break;
        case 'bossHit':
          this.tone(300, 0.2, 'square', 0.12, 120);
          break;
        case 'bossDown':
          [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'square', 0.1, undefined, i * 0.1));
          this.stopMusic();
          break;
        case 'goal':
          this.stopMusic();
          [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, 'square', 0.09, undefined, i * 0.11));
          break;
        case 'gameOver':
          this.stopMusic();
          [392, 370, 349, 330].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, undefined, i * 0.3));
          break;
        default:
          break;
      }
    }
  }

  ui(): void {
    this.tone(660, 0.06, 'square', 0.06);
  }

  // ------------------------------------------------------------ music
  startMusic(name: keyof typeof SONGS): void {
    if (!this.ctx) return;
    this.stopMusic();
    this.song = SONGS[name];
    this.stepIndex = 0;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  /** Look-ahead scheduler: queue notes ~120 ms ahead on the audio clock. */
  private schedule(): void {
    const c = this.ctx;
    if (!c || !this.musicGain) return;
    const stepDur = 60 / this.song.bpm / 3; // triplet feel: three steps per beat (6/8)
    while (this.nextNote < c.currentTime + 0.12) {
      const i = this.stepIndex % this.song.melody.length;
      const m = this.song.melody[i]!;
      const b = this.song.bass[i % this.song.bass.length]!;
      const when = this.nextNote - c.currentTime;
      if (m !== null) this.tone(midi(m), stepDur * 0.9, this.song.lead, 0.22, undefined, when, this.musicGain);
      if (b !== null) this.tone(midi(b), stepDur * 2.5, 'triangle', 0.35, undefined, when, this.musicGain);
      this.nextNote += stepDur;
      this.stepIndex++;
    }
  }
}

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

interface Song {
  bpm: number;
  lead: Wave;
  melody: (number | null)[];
  bass: (number | null)[];
}

// Original tunes, written for this game. Notes are MIDI numbers, one per
// eighth note in 6/8; null is a rest. A natural minor / D dorian flavours.
const _ = null;
const SONGS = {
  docks: {
    bpm: 112,
    lead: 'square',
    melody: [
      69, _, 72, 76, _, 74, 72, _, 69, 71, _, 67,
      69, _, 72, 76, _, 79, 77, 76, 74, 76, _, _,
      77, _, 76, 74, _, 72, 71, _, 72, 74, _, 71,
      69, 71, 72, 71, _, 67, 69, _, _, 69, _, _,
    ],
    bass: [45, _, _, 52, _, _, 43, _, _, 50, _, _, 45, _, _, 52, _, _, 48, _, _, 52, _, _, 50, _, _, 45, _, _, 43, _, _, 47, _, _, 45, _, _, 52, _, _, 45, _, _, 45, _, _],
  },
  ship: {
    bpm: 124,
    lead: 'square',
    melody: [
      62, _, 65, 69, _, 65, 67, _, 64, 60, _, 64,
      62, _, 65, 69, _, 72, 71, 69, 67, 69, _, _,
      74, _, 72, 71, _, 69, 67, _, 69, 71, _, 67,
      65, 64, 62, 64, _, 61, 62, _, _, 62, _, _,
    ],
    bass: [38, _, _, 45, _, _, 36, _, _, 43, _, _, 38, _, _, 45, _, _, 41, _, _, 45, _, _, 43, _, _, 38, _, _, 36, _, _, 40, _, _, 38, _, _, 45, _, _, 38, _, _, 38, _, _],
  },
  fortress: {
    bpm: 96,
    lead: 'triangle',
    melody: [
      57, _, _, 60, _, 59, 57, _, _, 55, _, _,
      57, _, 60, 64, _, 63, 64, _, _, _, _, _,
      65, _, 64, 62, _, 60, 59, _, 60, 62, _, 59,
      57, _, _, 56, _, _, 57, _, _, _, _, _,
    ],
    bass: [33, _, _, _, _, _, 31, _, _, _, _, _, 33, _, _, _, _, _, 28, _, _, _, _, _],
  },
  boss: {
    bpm: 150,
    lead: 'sawtooth',
    melody: [
      57, 57, 60, 57, 63, 57, 62, 57, 60, 57, 59, 56,
      57, 57, 60, 57, 63, 57, 64, 63, 62, 60, 59, _,
    ],
    bass: [33, _, 33, 33, _, 33, 31, _, 31, 32, _, 32],
  },
} satisfies Record<string, Song>;
