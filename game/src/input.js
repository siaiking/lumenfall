// Keyboard and mouse, read once a frame: the world asks what is held and
// what was just pressed, never touching DOM events itself.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mousePressed = false;
    this.canvas = canvas;
    this.queue = [];

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      this.queue.push(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = event.clientX - rect.left;
      this.mouseY = event.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
      if (event.button === 2) this.queue.push('Dash');
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /** The movement vector from WASD or the arrow keys, normalised. */
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const length = Math.hypot(x, y);
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  /** True while the fire button (mouse or Space) is held. */
  firing() {
    return this.mouseDown || this.keys.has('Space');
  }

  /** True while the dash key (Shift) is held. */
  dashHeld() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** True once for a key pressed since the last frame; consumes it. */
  wasPressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /** True once for a mouse click since the last frame; consumes it. */
  wasClicked() {
    if (this.mousePressed) {
      this.mousePressed = false;
      return true;
    }
    return false;
  }

  /** The mouse position in canvas CSS pixels. */
  mouse() {
    return { x: this.mouseX, y: this.mouseY };
  }

  /** Clears the per-frame presses; called at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
  }
}
