import { describe, it, expect } from 'vitest';
import { toPES } from '../pes.ts';
import { run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

function stitch(x: number, y: number, c = 0): StitchEvent {
  return { t: 'stitch', x, y, c };
}
function jump(x: number, y: number, c = 0): StitchEvent {
  return { t: 'jump', x, y, c };
}
function colorEvt(c = 0): StitchEvent {
  return { t: 'color', x: 0, y: 0, c };
}
function trimEvt(): StitchEvent {
  return { t: 'trim', x: 0, y: 0, c: 0 };
}
function markEvt(): StitchEvent {
  return { t: 'mark', x: 0, y: 0, c: 0 };
}

// ── PEC stitch-data decoder ─────────────────────────────────────────────────
// From PEC block header offset: PES section (22) + PEC header (511) + block header (16) = 549
const PEC_STITCH_OFFSET = 22 + 511 + 16;

interface PecRecord {
  type: 'stitch' | 'jump' | 'trim' | 'color' | 'end';
  dx: number;
  dy: number;
}

function decodePecByte(b: number): { long: boolean; jump: boolean; trim: boolean; valHi: number } {
  return {
    long: !!(b & 0x80),
    jump: !!(b & 0x10),
    trim: !!(b & 0x20),
    valHi: b & 0x0f,
  };
}

/** Parse all PEC records from the stitch-data section of a .PES file. */
function parsePecRecords(buf: Uint8Array): PecRecord[] {
  const records: PecRecord[] = [];
  let i = PEC_STITCH_OFFSET;

  while (i < buf.length) {
    const b0 = buf[i];

    // End marker
    if (b0 === 0xff) {
      records.push({ type: 'end', dx: 0, dy: 0 });
      break;
    }

    // Colour change: 0xFE 0xB0 0x0N
    if (b0 === 0xfe && buf[i + 1] === 0xb0) {
      records.push({ type: 'color', dx: 0, dy: 0 });
      i += 3;
      continue;
    }

    // Decode x coordinate
    let dx: number, dy: number;
    let isJump = false,
      isTrim = false;
    const h0 = decodePecByte(b0);

    if (h0.long) {
      const b1 = buf[++i];
      const raw = (h0.valHi << 8) | b1;
      dx = raw >= 0x800 ? raw - 0x1000 : raw; // 12-bit sign extend
      isJump = h0.jump;
      isTrim = h0.trim;
    } else {
      dx = (b0 & 0x7f) >= 64 ? (b0 & 0x7f) - 128 : b0 & 0x7f;
    }
    i++;

    // Decode y coordinate
    const b2 = buf[i];
    const h2 = decodePecByte(b2);

    if (h2.long) {
      const b3 = buf[++i];
      const raw = (h2.valHi << 8) | b3;
      dy = raw >= 0x800 ? raw - 0x1000 : raw;
      if (h2.jump) isJump = true;
      if (h2.trim) isTrim = true;
    } else {
      dy = (b2 & 0x7f) >= 64 ? (b2 & 0x7f) - 128 : b2 & 0x7f;
    }
    i++;

    const type = isTrim ? 'trim' : isJump ? 'jump' : 'stitch';
    records.push({ type, dx, dy });
  }
  return records;
}

// ── file structure ────────────────────────────────────────────────────────────
describe('toPES', () => {
  describe('file structure', () => {
    it('returns a Uint8Array', () => {
      expect(toPES([stitch(0, 0), stitch(0, 5)])).toBeInstanceOf(Uint8Array);
    });

    it('starts with the PES v1 magic bytes "#PES0001"', () => {
      const out = toPES([stitch(0, 0), stitch(0, 5)]);
      const magic = new TextDecoder().decode(out.slice(0, 8));
      expect(magic).toBe('#PES0001');
    });

    it('PEC offset field (bytes 8–11) equals 22 (decimal)', () => {
      const out = toPES([stitch(0, 0), stitch(0, 5)]);
      const pecOffset = out[8] | (out[9] << 8) | (out[10] << 16) | (out[11] << 24);
      expect(pecOffset).toBe(22);
    });

    it('PEC block starts with "LA:" at offset 22', () => {
      const out = toPES([stitch(0, 0), stitch(0, 5)]);
      expect(out[22]).toBe(0x4c); // 'L'
      expect(out[23]).toBe(0x41); // 'A'
      expect(out[24]).toBe(0x3a); // ':'
    });
  });

  // ── PEC header ──────────────────────────────────────────────────────────────
  describe('PEC header', () => {
    it('label field is 16 chars (space-padded), uppercase', () => {
      const out = toPES([stitch(0, 0), stitch(0, 5)], 'bloom');
      const labelBytes = out.slice(25, 41); // after "LA:", 16 chars
      const label = new TextDecoder().decode(labelBytes);
      expect(label).toMatch(/^BLOOM\s+$/); // BLOOM followed by spaces
    });

    it('label is sanitised (spaces become underscores)', () => {
      const out = toPES([stitch(0, 0), stitch(0, 5)], 'my design');
      const labelBytes = out.slice(25, 41);
      const label = new TextDecoder().decode(labelBytes);
      expect(label).toMatch(/^MY_DESIGN/);
    });

    it('label is truncated to 16 chars', () => {
      const out = toPES([stitch(0, 0), stitch(0, 5)], 'averylongnamethatexceedslimit');
      const labelBytes = out.slice(25, 41);
      const label = new TextDecoder().decode(labelBytes);
      expect(label.trimEnd().length).toBeLessThanOrEqual(16);
    });

    it('default label is NEEDLESCRIPT when none provided', () => {
      const out = toPES([stitch(0, 0), stitch(0, 5)]);
      const region = new TextDecoder().decode(out.slice(22, 100));
      expect(region).toContain('NEEDLESCRIPT');
    });

    it('byte at offset 41 (after label) is 0x0D (CR)', () => {
      const out = toPES([stitch(0, 0), stitch(0, 5)]);
      expect(out[41]).toBe(0x0d);
    });
  });

  // ── end-of-stitches marker ──────────────────────────────────────────────────
  describe('end-of-stitches marker', () => {
    it('first 0xFF after stitch data marks end of PEC stitches', () => {
      const out = toPES([stitch(0, 0), stitch(0, 5)]);
      const records = parsePecRecords(out);
      expect(records.at(-1)?.type).toBe('end');
    });
  });

  // ── colour-change record ───────────────────────────────────────────────────
  describe('colour-change record', () => {
    it('color event produces a 0xFE 0xB0 sequence in stitch data', () => {
      const events = [stitch(0, 0), stitch(0, 5), colorEvt(1), stitch(0, 5), stitch(0, 10)];
      const out = toPES(events);
      // Find 0xFE 0xB0 in file (past fixed headers)
      let found = false;
      for (let i = PEC_STITCH_OFFSET; i < out.length - 1; i++) {
        if (out[i] === 0xfe && out[i + 1] === 0xb0) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('alternates 0x02 and 0x01 on successive colour changes', () => {
      const events = [
        stitch(0, 0),
        stitch(0, 5),
        colorEvt(1),
        stitch(0, 5),
        stitch(0, 10),
        colorEvt(2),
        stitch(0, 10),
        stitch(0, 15),
      ];
      const out = toPES(events);
      const thirdBytes: number[] = [];
      for (let i = PEC_STITCH_OFFSET; i < out.length - 2; i++) {
        if (out[i] === 0xfe && out[i + 1] === 0xb0) {
          thirdBytes.push(out[i + 2]);
          i += 2;
        }
      }
      expect(thirdBytes).toEqual([0x02, 0x01]);
    });

    it('mark events are silently dropped', () => {
      const withMark = toPES([stitch(0, 0), markEvt(), stitch(0, 5)]);
      const withoutMark = toPES([stitch(0, 0), stitch(0, 5)]);
      expect(withMark).toEqual(withoutMark);
    });
  });

  // ── trim record ───────────────────────────────────────────────────────────
  describe('trim record', () => {
    it('trim event produces three consecutive zero-delta trim records', () => {
      const events = [stitch(0, 0), stitch(0, 5), trimEvt(), stitch(0, 10)];
      const out = toPES(events);
      const records = parsePecRecords(out).filter((r) => r.type !== 'end');
      let trimRun = 0,
        maxRun = 0;
      for (const r of records) {
        if (r.type === 'trim' && r.dx === 0 && r.dy === 0) {
          trimRun++;
          maxRun = Math.max(maxRun, trimRun);
        } else {
          trimRun = 0;
        }
      }
      expect(maxRun).toBeGreaterThanOrEqual(3);
    });
  });

  // ── coordinate encoding ────────────────────────────────────────────────────
  describe('coordinate encoding', () => {
    it('encodes a vertical stitch correctly (y in 0.1 mm units)', () => {
      const out = toPES([stitch(0, 0), stitch(0, 10)]);
      const records = parsePecRecords(out).filter((r) => r.type === 'stitch');
      const totalDY = records.reduce((s, r) => s + r.dy, 0);
      expect(totalDY).toBe(100); // 10 mm × 10 = 100 units
    });

    it('encodes a horizontal stitch correctly', () => {
      const out = toPES([stitch(0, 0), stitch(5, 0)]);
      const records = parsePecRecords(out).filter((r) => r.type === 'stitch');
      const totalDX = records.reduce((s, r) => s + r.dx, 0);
      expect(totalDX).toBe(50); // 5 mm × 10 = 50 units
    });

    it('uses short (1-byte) encoding for small deltas (−63..62)', () => {
      // A 5mm stitch = 50 units; should use short encoding (1 byte per coord)
      const out = toPES([stitch(0, 0), stitch(5, 0)]);
      // 50 is in range (−64, 63), so short encoding: high bit of x byte should be 0
      const xByte = out[PEC_STITCH_OFFSET];
      expect(xByte & 0x80).toBe(0); // bit 7 clear → short encoding
    });

    it('uses long (2-byte) encoding for delta ≥ 63 units', () => {
      // Single stitch to (7mm, 0): dx=70 from origin, ≥ 63 → must use long encoding.
      // Long encoding has bit 7 of the first byte set.
      const out = toPES([stitch(7, 0)]);
      const xByte = out[PEC_STITCH_OFFSET];
      expect(xByte & 0x80).toBe(0x80); // bit 7 set → long encoding
    });

    it('encodes jump events with the jump flag (0x10) in high byte', () => {
      const events = [stitch(0, 0), jump(0, 10), stitch(0, 10)];
      const out = toPES(events);
      const records = parsePecRecords(out).filter((r) => r.type !== 'end');
      expect(records.some((r) => r.type === 'jump')).toBe(true);
    });

    it('splits large moves into multiple records (max 2047 units each)', () => {
      // 300 mm = 3000 units, needs splitting
      const out = toPES([stitch(0, 0), stitch(0, 300)]);
      const records = parsePecRecords(out).filter((r) => r.type !== 'end');
      expect(records.every((r) => Math.abs(r.dy) <= 2047)).toBe(true);
      const totalDY = records.reduce((s, r) => s + r.dy, 0);
      expect(totalDY).toBe(3000);
    });
  });

  // ── round-trip with run() ─────────────────────────────────────────────────
  describe('round-trip with run()', () => {
    it('a real bloom design produces a valid PES file', () => {
      const result = run('stitchlen 2.2\nrepeat 12 [\n  repeat 36 [ fd 3.4 rt 10 ]\n  rt 30\n]');
      const out = toPES(result.events, 'bloom');
      expect(out).toBeInstanceOf(Uint8Array);
      expect(out.length).toBeGreaterThan(22 + 511 + 16);
      const magic = new TextDecoder().decode(out.slice(0, 8));
      expect(magic).toBe('#PES0001');
    });

    it('produces a non-empty file for a minimal design', () => {
      const result = run('fd 5');
      const out = toPES(result.events);
      expect(out.length).toBeGreaterThan(22 + 511 + 16 + 1); // at least 1 stitch record
    });
  });
});
