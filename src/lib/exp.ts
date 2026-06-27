// ============================================================
// Melco/Elna EXP encoder
// Produces a valid binary .EXP file from a stitch event stream.
// No header — purely a flat sequence of 2- or 4-byte records.
//
// Record types:
//   Stitch:        [dx & 0xFF, dy & 0xFF]           (2 bytes)
//   Jump:          [0x80, 0x04, dx & 0xFF, dy & 0xFF] (4 bytes)
//   Trim:          [0x80, 0x80, 0x07, 0x00]           (4 bytes)
//   Colour change: [0x80, 0x01, 0x00, 0x00]           (4 bytes)
//   End of file:   no explicit terminator
//
// Coordinates are in 0.1 mm units (mm × 10), matching the DST convention.
// The maximum absolute delta per record is 127 (0x80 = 128 is reserved as
// the control-byte prefix, so using 128 as a delta would corrupt the stream).
// Moves larger than 127 units are split into multiple same-type records.
// No DOM dependencies.
// ============================================================

import type { StitchEvent } from './engine.ts';

// 0x80 is the EXP control-byte sentinel; coordinates must never equal it.
// Keeping absolute deltas ≤ 127 ensures dx/dy bytes are always ≠ 0x80.
const MAX_DELTA = 127;

export function toEXP(events: StitchEvent[], _label?: string): Uint8Array {
  const bytes: number[] = [];
  let cx = 0,
    cy = 0; // current position in 0.1 mm units

  /**
   * Emit a move towards (tx, ty), split into ≤ MAX_DELTA steps.
   * `isJump` prepends [0x80, 0x04] before each step's coordinate pair.
   */
  function emitMove(tx: number, ty: number, isJump: boolean): void {
    let dx = tx - cx,
      dy = ty - cy;
    do {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_DELTA));
      const sx = steps > 1 ? Math.round(dx / steps) : dx;
      const sy = steps > 1 ? Math.round(dy / steps) : dy;
      if (isJump) bytes.push(0x80, 0x04);
      bytes.push(sx & 0xff, sy & 0xff);
      cx += sx;
      cy += sy;
      dx = tx - cx;
      dy = ty - cy;
    } while (dx !== 0 || dy !== 0);
  }

  for (const e of events) {
    if (e.t === 'mark') continue; // debug pins are never exported

    if (e.t === 'color') {
      bytes.push(0x80, 0x01, 0x00, 0x00); // colour change
      continue;
    }

    if (e.t === 'trim') {
      bytes.push(0x80, 0x80, 0x07, 0x00); // thread cut
      continue;
    }

    const tx = Math.round(e.x * 10),
      ty = Math.round(e.y * 10);
    emitMove(tx, ty, e.t === 'jump');
  }

  // EXP has no explicit end-of-file marker — the stream ends here.
  return new Uint8Array(bytes);
}
