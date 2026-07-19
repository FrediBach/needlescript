// ============================================================
// Brother PES v1 encoder (with embedded PEC block)
// Produces a valid binary .PES file from a stitch event stream.
// File structure follows the "truncated v1" layout used by pyembroidery:
//   - 8-byte magic "#PES0001"
//   - 4-byte PEC offset (= 22)
//   - 10 zero bytes (minimal PES section)
//   - 511-byte PEC header
//   - 16-byte PEC block header
//   - Variable-length stitch data (PEC-encoded)
//   - 228 × (1 + numColors) bytes of zeroed thumbnail data
// No DOM dependencies.
// ============================================================

import type { ColorTableEntry, StitchEvent } from '../core/types.ts';
import { colorDist, defaultSlotColor } from '../core/colormath.ts';

export const PES_CATALOG = [
  '#000000',
  '#ffffff',
  '#d7342e',
  '#e76e2e',
  '#f4c430',
  '#2f8f46',
  '#167d8d',
  '#2864b4',
  '#293466',
  '#6c3fa0',
  '#a73b79',
  '#e78db4',
  '#7a4b2d',
  '#b18452',
  '#9a9a9a',
  '#d6d6d6',
] as const;

function nearestCatalogIndex(hex: string): number {
  let best = 0;
  let distance = Infinity;
  PES_CATALOG.forEach((candidate, index) => {
    const next = colorDist(hex, candidate);
    if (next < distance) {
      distance = next;
      best = index;
    }
  });
  return best;
}

// PEC long-encoding flag bits (placed in the high byte of the 2-byte long record)
const PEC_JUMP_FLAG = 0x10; // bit 4 of high byte → jump move
const PEC_TRIM_FLAG = 0x20; // bit 5 of high byte → trim/cut move

// Thumbnail dimensions per the PEC spec
const PEC_ICON_W = 48; // pixels wide
const PEC_ICON_H = 38; // pixels tall
const PEC_ICON_STRIDE = PEC_ICON_W / 8; // bytes per row = 6
const PEC_THUMBNAIL_BYTES = PEC_ICON_STRIDE * PEC_ICON_H; // 228 bytes per colour block

// Offset of the PEC block from the start of the file (bytes 0–21 = PES section)
const PES_SECTION_SIZE = 14; // 4-byte PEC offset field + 10 zero bytes
const PEC_OFFSET = 8 + PES_SECTION_SIZE; // = 22

// Fixed length of the PEC header that precedes stitch data
const PEC_HEADER_SIZE = 511;

// Fixed length of the PEC block header
const PEC_BLOCK_HEADER_SIZE = 16;

/**
 * Emit one PEC coordinate value into `out`.
 *
 * Short encoding (1 byte):  when `forceLong` is false AND -64 < val < 63.
 * Long encoding  (2 bytes): everything else, plus all jumps/trims.
 *
 * Long encoding bit layout (16-bit value → 2 bytes, high byte first):
 *   bit 15   : FLAG_LONG  (always 1)
 *   bit 13   : TRIM flag  (0x20 << 8 = 0x2000)
 *   bit 12   : JUMP flag  (0x10 << 8 = 0x1000)
 *   bits 11–0: 12-bit two's-complement value
 */
function emitCoord(val: number, forceLong: boolean, flag: number, out: number[]): void {
  if (!forceLong && val > -64 && val < 63) {
    out.push(val & 0x7f);
  } else {
    const word = (val & 0xfff) | 0x8000 | (flag << 8);
    out.push((word >> 8) & 0xff, word & 0xff);
  }
}

export function toPES(
  events: StitchEvent[],
  label?: string,
  colorTable: readonly ColorTableEntry[] = [],
): Uint8Array {
  const blockColors: number[] = [];
  for (const event of events) {
    if (event.t === 'stitch' && blockColors.at(-1) !== event.c) blockColors.push(event.c);
  }
  const catalogIndices = blockColors.map((index) =>
    nearestCatalogIndex(colorTable[index]?.hex ?? defaultSlotColor(index)),
  );
  // ── Phase 1: Build PEC stitch byte array ────────────────────────────────────
  const stitchBytes: number[] = [];
  let cx = 0,
    cy = 0; // current position in 0.1 mm units
  let numColors = 1; // total thread colour count
  let colorToggle = true; // alternates 0x02/0x01 in colour-change records
  let minX = 0,
    maxX = 0,
    minY = 0,
    maxY = 0;
  let hasPts = false;

  /** Emit one delta step and update tracked position/bounds. */
  function emitStep(dx: number, dy: number, isJump: boolean, flag: number): void {
    emitCoord(dx, isJump, flag, stitchBytes);
    emitCoord(dy, isJump, flag, stitchBytes);
    cx += dx;
    cy += dy;
    if (!isJump) {
      if (!hasPts) {
        minX = maxX = cx;
        minY = maxY = cy;
        hasPts = true;
      } else {
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
      }
    }
  }

  /** Split a large move into at most 2047-unit steps and emit each step. */
  function emitMove(tx: number, ty: number, isJump: boolean, flag: number): void {
    let dx = tx - cx,
      dy = ty - cy;
    do {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2047));
      const sx = steps > 1 ? Math.round(dx / steps) : dx;
      const sy = steps > 1 ? Math.round(dy / steps) : dy;
      emitStep(sx, sy, isJump, flag);
      dx = tx - cx;
      dy = ty - cy;
    } while (dx !== 0 || dy !== 0);
  }

  for (const e of events) {
    if (e.t === 'mark') continue; // debug pins are never exported

    if (e.t === 'color') {
      // PEC colour-change record: 0xFE 0xB0 then alternating 0x02 / 0x01
      stitchBytes.push(0xfe, 0xb0, colorToggle ? 0x02 : 0x01);
      colorToggle = !colorToggle;
      numColors++;
      continue;
    }

    if (e.t === 'trim') {
      // 3 × zero-length trim records (same convention as DST)
      for (let i = 0; i < 3; i++) {
        emitCoord(0, true, PEC_TRIM_FLAG, stitchBytes);
        emitCoord(0, true, PEC_TRIM_FLAG, stitchBytes);
      }
      continue;
    }

    const tx = Math.round(e.x * 10),
      ty = Math.round(e.y * 10);
    if (e.t === 'jump') {
      emitMove(tx, ty, true, PEC_JUMP_FLAG);
    } else {
      emitMove(tx, ty, false, 0);
    }
  }

  stitchBytes.push(0xff); // end-of-stitches marker

  // ── Phase 2: Assemble the binary buffer ─────────────────────────────────────
  const stitchBlockLen = PEC_BLOCK_HEADER_SIZE + stitchBytes.length;
  // One combined thumbnail + one per-colour thumbnail, each 228 bytes
  const thumbnailBytes = PEC_THUMBNAIL_BYTES * (1 + numColors);

  const totalSize =
    8 + // magic "#PES0001"
    PES_SECTION_SIZE + // PES section (PEC offset field + padding)
    PEC_HEADER_SIZE + // PEC header
    PEC_BLOCK_HEADER_SIZE +
    stitchBytes.length +
    thumbnailBytes; // zeroed thumbnail (already zero-initialised)

  const buf = new Uint8Array(totalSize);
  let o = 0;

  // — Magic ——————————————————————————————————————————————————————————————————
  const magic = '#PES0001';
  for (let i = 0; i < 8; i++) buf[o++] = magic.charCodeAt(i);

  // — PEC offset (uint32 LE) ————————————————————————————————————————————————
  buf[o++] = PEC_OFFSET & 0xff;
  buf[o++] = (PEC_OFFSET >> 8) & 0xff;
  buf[o++] = (PEC_OFFSET >> 16) & 0xff;
  buf[o++] = (PEC_OFFSET >> 24) & 0xff;

  // — 10-byte zeroed PES section ————————————————————————————————————————————
  o += 10; // already zero-initialised

  // — PEC header (511 bytes) starts at offset 22 ————————————————————————————
  // Row 1: "LA:" + 16-char label (left-aligned, space-padded) + CR
  const rawLabel = (label || 'NEEDLESCRIPT')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 16)
    .padEnd(16, ' ');

  buf[o++] = 0x4c;
  buf[o++] = 0x41;
  buf[o++] = 0x3a; // "LA:"
  for (let i = 0; i < 16; i++) buf[o++] = rawLabel.charCodeAt(i);
  buf[o++] = 0x0d; // CR

  // 12 spaces, 0xFF, 0x00
  for (let i = 0; i < 12; i++) buf[o++] = 0x20;
  buf[o++] = 0xff;
  buf[o++] = 0x00;

  // Icon byte stride + height
  buf[o++] = PEC_ICON_STRIDE; // 6
  buf[o++] = PEC_ICON_H; // 38

  // 12 spaces before colour-index list
  for (let i = 0; i < 12; i++) buf[o++] = 0x20;

  // Colour-index list: [numChanges, idx0, idx1, ...]
  // numChanges = numColors - 1; indices are simplified sequential values
  buf[o++] = numColors - 1;
  for (let i = 0; i < numColors; i++) buf[o++] = catalogIndices[i] ?? 0;

  // Pad the colour section to exactly 463 bytes (spaces fill remaining slots)
  for (let i = numColors + 1; i < 463; i++) buf[o++] = 0x20;

  // Total PEC header bytes written: 20 + 14 + 2 + 12 + 463 = 511 ✓

  // — PEC block header (16 bytes) ———————————————————————————————————————————
  buf[o++] = 0x00;
  buf[o++] = 0x00;
  // stitch_block_length as uint24 LE
  buf[o++] = stitchBlockLen & 0xff;
  buf[o++] = (stitchBlockLen >> 8) & 0xff;
  buf[o++] = (stitchBlockLen >> 16) & 0xff;
  buf[o++] = 0x31;
  buf[o++] = 0xff;
  buf[o++] = 0xf0;
  // Design dimensions in 0.1 mm units (uint16 LE each)
  const designW = Math.max(0, maxX - minX);
  const designH = Math.max(0, maxY - minY);
  buf[o++] = designW & 0xff;
  buf[o++] = (designW >> 8) & 0xff;
  buf[o++] = designH & 0xff;
  buf[o++] = (designH >> 8) & 0xff;
  buf[o++] = 0xe0;
  buf[o++] = 0x01; // 0x01E0 fixed
  buf[o++] = 0xb0;
  buf[o++] = 0x01; // 0x01B0 fixed

  // — Stitch data ———————————————————————————————————————————————————————————
  for (const b of stitchBytes) buf[o++] = b;

  // — Thumbnail (all zeros, already initialised by Uint8Array) ——————————————
  // o += thumbnailBytes; // no-op: buffer is pre-zeroed

  return buf;
}
