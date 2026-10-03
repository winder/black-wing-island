// Keyboard and mouse. The mouse is captured (pointer lock) while playing.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (this.locked && ['Space', 'Tab', 'ControlLeft', 'KeyC'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  get locked() { return document.pointerLockElement === this.canvas; }
  lock() { if (!this.locked) this.canvas.requestPointerLock()?.catch?.(() => {}); }
  unlock() { if (this.locked) document.exitPointerLock(); }

  isDown(...codes: string[]) { return codes.some((c) => this.down.has(c)); }
  /** True once per key press. */
  wasPressed(code: string) { return this.pressed.has(code); }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
  }
}
