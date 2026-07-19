// ---------- Public stitch machine ----------

import { FillMachine } from './machine-fill.ts';

/** The public stitch machine combines the core, satin, and fill subsystems. */
export class Machine extends FillMachine {
  colorChange(n: number) {
    this.flushSatin();
    const idx = Math.max(0, Math.round(n));
    if (idx === this.colorIdx && this.started) return;
    if (this.started) {
      const [hx, hy] = this.mapOut(this.x, this.y);
      this._push('color', hx, hy);
    }
    this.colorIdx = idx;
  }

  trimThread() {
    this.flushSatin();
    if (this.started) {
      const [hx, hy] = this.mapOut(this.x, this.y);
      this._push('trim', hx, hy);
    }
  }
}
