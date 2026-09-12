import * as THREE from 'three';
import { audio } from './audio.js';

/* One movement vector, however it arrived: WASD, arrows, or a floating thumb stick. */
export class Input {
  constructor(canvas, stickEl){
    this.dir = new THREE.Vector2();       // -1..1, y is +forward (screen up)
    this.keys = new Set();
    this.stickEl = stickEl;
    this.touchId = null;
    this.origin = new THREE.Vector2();
    this.used = false;                    // has the player moved at all yet

    addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
      audio.init();
      this.keys.add(e.code); this.used = true;
    });
    addEventListener('keyup',   e => this.keys.delete(e.code));
    addEventListener('blur',    () => this.keys.clear());

    const RAD = () => Math.min(innerWidth, innerHeight) * 0.075;

    canvas.addEventListener('pointerdown', e => {
      audio.init();
      if (this.touchId !== null) return;
      this.touchId = e.pointerId;
      this.origin.set(e.clientX, e.clientY);
      this.used = true;
      stickEl.style.left = e.clientX + 'px';
      stickEl.style.top  = e.clientY + 'px';
      stickEl.classList.add('on');
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== this.touchId) return;
      const dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
      const r = RAD(), len = Math.hypot(dx, dy), k = Math.min(len, r);
      const nx = len ? dx / len : 0, ny = len ? dy / len : 0;
      this.stick = new THREE.Vector2(nx * (k / r), -ny * (k / r));
      const knob = stickEl.firstElementChild;
      knob.style.transform = `translate(${nx*k}px,${ny*k}px)`;
    });

    const end = e => {
      if (e.pointerId !== this.touchId) return;
      this.touchId = null; this.stick = null;
      stickEl.classList.remove('on');
      stickEl.firstElementChild.style.transform = '';
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Read once per frame. Returns a clamped-to-unit direction in screen space. */
  read(){
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyA') || k.has('ArrowLeft'))  x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp'))    y += 1;
    if (k.has('KeyS') || k.has('ArrowDown'))  y -= 1;
    this.dir.set(x, y);
    if (this.dir.lengthSq() > 1) this.dir.normalize();
    if (this.stick && this.stick.lengthSq() > this.dir.lengthSq()) this.dir.copy(this.stick);
    return this.dir;
  }
}
