/**
 * Input abstraction. The simulation only ever sees `InputState`, so a control
 * scheme change never touches gameplay code and gamepad support on mobile is
 * free.
 *
 * Touch layout rules (enforced in QA, GDD §10.4):
 *  - every target >= 48dp, >= 8dp apart
 *  - the movement stick is floating: it anchors where the thumb lands
 *  - nothing interactive within 40dp of a screen edge (gesture-nav conflict)
 */

export interface InputState {
  moveX: number;
  moveY: number;
  /** Aim direction in screen space, normalised. */
  aimX: number;
  aimY: number;
  attack: boolean;
  skill1: boolean;
  skill2: boolean;
  dodge: boolean;
  interact: boolean;
  tacticalPause: boolean;
  /** Screen-space pointer, for aim-by-touch and UI hit tests. */
  pointerX: number;
  pointerY: number;
  pointerDown: boolean;
}

export function emptyInput(): InputState {
  return {
    moveX: 0, moveY: 0, aimX: 1, aimY: 0,
    attack: false, skill1: false, skill2: false,
    dodge: false, interact: false, tacticalPause: false,
    pointerX: 0, pointerY: 0, pointerDown: false,
  };
}

export interface InputAdapter {
  poll(): InputState;
  dispose(): void;
  /** Rendered by the HUD so the touch controls can draw themselves. */
  readonly stick: { active: boolean; originX: number; originY: number; x: number; y: number };
}

const STICK_DEAD = 12;
const STICK_RADIUS = 64;

/**
 * Buttons are real DOM elements rendered by the HUD, so their geometry lives in
 * exactly one place (CSS) instead of being duplicated as hit-test rectangles
 * here. They write into this shared record; TouchInput only reads it.
 */
export const touchButtons: Record<string, boolean> = {
  attack: false, skill1: false, skill2: false, dodge: false, interact: false, pause: false,
};

/** Touch: floating stick on the left half, action buttons on the right. */
export class TouchInput implements InputAdapter {
  private state = emptyInput();
  readonly stick = { active: false, originX: 0, originY: 0, x: 0, y: 0 };
  private moveId: number | null = null;

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp, { passive: false });
    el.addEventListener('pointercancel', this.onUp, { passive: false });
  }

  private onDown = (ev: PointerEvent): void => {
    if (this.moveId === null && ev.clientX < this.el.clientWidth * 0.5) {
      this.moveId = ev.pointerId;
      this.stick.active = true;
      this.stick.originX = ev.clientX;
      this.stick.originY = ev.clientY;
      this.stick.x = ev.clientX;
      this.stick.y = ev.clientY;
      ev.preventDefault();
      return;
    }
    // Right half: aim.
    this.state.pointerDown = true;
    this.state.pointerX = ev.clientX;
    this.state.pointerY = ev.clientY;
  };

  private onMove = (ev: PointerEvent): void => {
    if (ev.pointerId === this.moveId) {
      this.stick.x = ev.clientX;
      this.stick.y = ev.clientY;
      ev.preventDefault();
      return;
    }
    if (this.state.pointerDown) {
      this.state.pointerX = ev.clientX;
      this.state.pointerY = ev.clientY;
    }
  };

  private onUp = (ev: PointerEvent): void => {
    if (ev.pointerId === this.moveId) {
      this.moveId = null;
      this.stick.active = false;
      this.stick.x = this.stick.originX;
      this.stick.y = this.stick.originY;
    }
    this.state.pointerDown = false;
  };

  poll(): InputState {
    const s = this.state;
    if (this.stick.active) {
      const dx = this.stick.x - this.stick.originX;
      const dy = this.stick.y - this.stick.originY;
      const len = Math.hypot(dx, dy);
      if (len < STICK_DEAD) {
        s.moveX = 0;
        s.moveY = 0;
      } else {
        const scale = Math.min(1, len / STICK_RADIUS) / len;
        s.moveX = dx * scale;
        s.moveY = dy * scale;
      }
    } else {
      s.moveX = 0;
      s.moveY = 0;
    }
    s.attack = touchButtons.attack;
    s.skill1 = touchButtons.skill1;
    s.skill2 = touchButtons.skill2;
    s.dodge = touchButtons.dodge;
    s.interact = touchButtons.interact;
    s.tacticalPause = touchButtons.pause;
    return s;
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
  }
}

/** Keyboard + mouse, with gamepad folded in so desktop and web get parity free. */
export class KeyboardMouseInput implements InputAdapter {
  private state = emptyInput();
  private keys = new Set<string>();
  readonly stick = { active: false, originX: 0, originY: 0, x: 0, y: 0 };

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('contextmenu', this.onContextMenu);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    // Space would otherwise scroll the page.
    if (e.code === 'Space') e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent): void => void this.keys.delete(e.code);
  private onPointerMove = (e: PointerEvent): void => {
    this.state.pointerX = e.clientX;
    this.state.pointerY = e.clientY;
  };
  private onPointerDown = (e: PointerEvent): void => {
    this.state.pointerDown = true;
    this.state.pointerX = e.clientX;
    this.state.pointerY = e.clientY;
  };
  private onPointerUp = (): void => void (this.state.pointerDown = false);
  private onContextMenu = (e: Event): void => e.preventDefault();

  poll(): InputState {
    const s = this.state;
    s.moveX = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    s.moveY = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) -
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    s.attack = s.pointerDown || this.keys.has('KeyJ');
    s.skill1 = this.keys.has('KeyK') || this.keys.has('Digit1');
    s.skill2 = this.keys.has('KeyL') || this.keys.has('Digit2');
    s.dodge = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    s.interact = this.keys.has('KeyE');
    s.tacticalPause = this.keys.has('Space');

    const pad = navigator.getGamepads?.().find((p) => p);
    if (pad) {
      const dz = (v: number): number => (Math.abs(v) < 0.18 ? 0 : v);
      s.moveX = dz(pad.axes[0] ?? 0) || s.moveX;
      s.moveY = dz(pad.axes[1] ?? 0) || s.moveY;
      const ax = dz(pad.axes[2] ?? 0);
      const ay = dz(pad.axes[3] ?? 0);
      if (ax || ay) {
        const l = Math.hypot(ax, ay);
        s.aimX = ax / l;
        s.aimY = ay / l;
      }
      s.attack = s.attack || !!pad.buttons[0]?.pressed;
      s.skill1 = s.skill1 || !!pad.buttons[2]?.pressed;
      s.skill2 = s.skill2 || !!pad.buttons[3]?.pressed;
      s.dodge = s.dodge || !!pad.buttons[1]?.pressed;
      s.interact = s.interact || !!pad.buttons[4]?.pressed;
      s.tacticalPause = s.tacticalPause || !!pad.buttons[5]?.pressed;
    }
    return s;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.el.removeEventListener('pointermove', this.onPointerMove);
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    this.el.removeEventListener('pointerup', this.onPointerUp);
    this.el.removeEventListener('contextmenu', this.onContextMenu);
  }
}

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
