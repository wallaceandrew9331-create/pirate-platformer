// Keyboard, gamepad and on-screen touch buttons, merged into the sim's
// five-button Input plus a few menu keys.
import type { Input } from '../game/types.ts';

type Button = keyof Input;

const KEYS: Record<string, Button> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'jump',
  ArrowUp: 'jump',
  KeyW: 'jump',
  KeyZ: 'jump',
  KeyX: 'slash',
  KeyJ: 'slash',
  KeyC: 'parry',
  KeyK: 'parry',
};

export type MenuKey = 'confirm' | 'pause' | 'mute';

export class Controls {
  private keys = new Set<Button>();
  private touch = new Map<number, Button>();
  private padPrev = { start: false, a: false };
  private listeners: ((k: MenuKey) => void)[] = [];
  /** Set once any touch happens, so the UI can show the on-screen pad. */
  usedTouch = false;

  constructor(touchRoot: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const b = KEYS[e.code];
      if (b) {
        this.keys.add(b);
        e.preventDefault();
      }
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') this.emit('pause');
      else if (e.code === 'KeyM') this.emit('mute');
      else if (e.code === 'Enter' || e.code === 'Space') this.emit('confirm');
    });
    window.addEventListener('keyup', (e) => {
      const b = KEYS[e.code];
      if (b) this.keys.delete(b);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.clear();
    });
    this.bindTouch(touchRoot);
  }

  onMenu(fn: (k: MenuKey) => void): void {
    this.listeners.push(fn);
  }

  private emit(k: MenuKey): void {
    for (const fn of this.listeners) fn(k);
  }

  /**
   * Each finger is tracked by pointerId and can slide from one button to
   * another (left to right, or jump to slash) without lifting.
   */
  private bindTouch(root: HTMLElement): void {
    const buttonAt = (x: number, y: number): Button | null => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-btn]');
      return el && root.contains(el) ? (el.dataset.btn as Button) : null;
    };
    const update = (e: PointerEvent): void => {
      const b = buttonAt(e.clientX, e.clientY);
      if (b) this.touch.set(e.pointerId, b);
      else this.touch.delete(e.pointerId);
      this.paint(root);
    };
    root.addEventListener('pointerdown', (e) => {
      this.usedTouch = true;
      e.preventDefault();
      update(e);
      try {
        // Keep receiving this finger's moves even if it slides off the pad.
        root.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; the press already registered */
      }
    });
    root.addEventListener('pointermove', (e) => {
      if (this.touch.has(e.pointerId) || e.buttons) update(e);
    });
    const end = (e: PointerEvent): void => {
      this.touch.delete(e.pointerId);
      this.paint(root);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private paint(root: HTMLElement): void {
    const held = new Set(this.touch.values());
    for (const el of root.querySelectorAll<HTMLElement>('[data-btn]')) el.classList.toggle('held', held.has(el.dataset.btn as Button));
  }

  /** Poll everything; call once per animation frame. */
  read(): Input {
    const inp: Input = { left: false, right: false, jump: false, slash: false, parry: false };
    for (const b of this.keys) inp[b] = true;
    for (const b of this.touch.values()) inp[b] = true;
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const btn = (i: number): boolean => !!pad.buttons[i]?.pressed;
      const ax = pad.axes[0] ?? 0;
      if (ax < -0.4 || btn(14)) inp.left = true;
      if (ax > 0.4 || btn(15)) inp.right = true;
      if (btn(0) || btn(12)) inp.jump = true; // A / cross, d-pad up
      if (btn(2) || btn(3)) inp.slash = true; // X / square, Y / triangle
      if (btn(1) || btn(4) || btn(5)) inp.parry = true; // B / circle, bumpers
      const start = btn(9);
      if (start && !this.padPrev.start) this.emit('pause');
      if (btn(0) && !this.padPrev.a) this.emit('confirm');
      this.padPrev = { start, a: btn(0) };
    }
    return inp;
  }
}
