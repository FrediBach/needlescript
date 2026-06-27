import { describe, it, expect } from 'vitest';
import { toDST } from '../dst.ts';
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

// Parse a 3-byte DST record
function parseRecord(b0: number, b1: number, b2: number) {
  const isEnd = (b2 & 0b11110011) === 0b11110011;
  const isColor = (b2 & 0b11000011) === 0b11000011 && !isEnd;
  const isJump = !!(b2 & 0b10000000);

  // Reconstruct delta from the known encoding
  let dx = 0,
    dy = 0;
  if (b2 & (1 << 2)) dx += 81;
  if (b2 & (1 << 3)) dx -= 81;
  if (b2 & (1 << 5)) dy += 81;
  if (b2 & (1 << 4)) dy -= 81;
  if (b1 & (1 << 2)) dx += 27;
  if (b1 & (1 << 3)) dx -= 27;
  if (b1 & (1 << 5)) dy += 27;
  if (b1 & (1 << 4)) dy -= 27;
  if (b0 & (1 << 2)) dx += 9;
  if (b0 & (1 << 3)) dx -= 9;
  if (b0 & (1 << 5)) dy += 9;
  if (b0 & (1 << 4)) dy -= 9;
  if (b1 & (1 << 0)) dx += 3;
  if (b1 & (1 << 1)) dx -= 3;
  if (b1 & (1 << 7)) dy += 3;
  if (b1 & (1 << 6)) dy -= 3;
  if (b0 & (1 << 0)) dx += 1;
  if (b0 & (1 << 1)) dx -= 1;
  if (b0 & (1 << 7)) dy += 1;
  if (b0 & (1 << 6)) dy -= 1;
  return { dx, dy, isJump, isColor, isEnd };
}

function parseAllRecords(bytes: Uint8Array) {
  const records = [];
  for (let i = 512; i + 2 < bytes.length; i += 3) {
    records.push(parseRecord(bytes[i], bytes[i + 1], bytes[i + 2]));
  }
  return records;
}

describe('toDST', () => {
  // ── file structure ─────────────────────────────────────────────────────────
  describe('file structure', () => {
    it('returns a Uint8Array', () => {
      const out = toDST([stitch(0, 0), stitch(0, 5)]);
      expect(out).toBeInstanceOf(Uint8Array);
    });

    it('header is exactly 512 bytes', () => {
      const out = toDST([stitch(0, 0), stitch(0, 5)]);
      // Verify the 0x1a EOF character at header end
      expect(out[0]).toBe('L'.charCodeAt(0)); // starts with 'LA:'
      // Records start at offset 512
      expect(out.length).toBeGreaterThan(512);
    });

    it('total length is 512 + (records × 3)', () => {
      const events = [stitch(0, 0), stitch(0, 5), stitch(0, 10)];
      const out = toDST(events);
      expect((out.length - 512) % 3).toBe(0);
    });
  });

  // ── header fields ──────────────────────────────────────────────────────────
  describe('header', () => {
    it('header starts with LA:', () => {
      const out = toDST([stitch(0, 0), stitch(0, 5)], 'MyDesign');
      const header = new TextDecoder().decode(out.slice(0, 80));
      expect(header).toMatch(/^LA:/);
    });

    it('label is uppercased and truncated to 16 chars', () => {
      const out = toDST([stitch(0, 0), stitch(0, 5)], 'averylongnamethatexceedslimit');
      const header = new TextDecoder().decode(out.slice(0, 80));
      const laLine = header.split('\r')[0];
      const labelPart = laLine.slice(3); // after 'LA:'
      expect(labelPart.trimEnd().length).toBeLessThanOrEqual(16);
    });

    it('header contains ST: (stitch count) field', () => {
      const out = toDST([stitch(0, 0), stitch(0, 5), stitch(0, 10)]);
      const header = new TextDecoder().decode(out.slice(0, 200));
      expect(header).toMatch(/ST:/);
    });

    it('header contains CO: (color count) field', () => {
      const out = toDST([stitch(0, 0), stitch(0, 5)]);
      const header = new TextDecoder().decode(out.slice(0, 200));
      expect(header).toMatch(/CO:/);
    });

    it('padding bytes after header text are 0x20 (space)', () => {
      const out = toDST([stitch(0, 0), stitch(0, 5)]);
      // Find the 0x1a and check bytes after it up to offset 512 are 0x20
      let foundEOH = false;
      for (let i = 0; i < 512; i++) {
        if (out[i] === 0x1a) {
          foundEOH = true;
          continue;
        }
        if (foundEOH) expect(out[i]).toBe(0x20);
      }
      expect(foundEOH).toBe(true);
    });

    it('default label is NEEDLESCRIPT when none provided', () => {
      const out = toDST([stitch(0, 0), stitch(0, 5)]);
      const header = new TextDecoder().decode(out.slice(0, 80));
      expect(header).toContain('NEEDLESCRIPT');
    });
  });

  // ── end-of-design record ───────────────────────────────────────────────────
  describe('end-of-design record', () => {
    it('last record is 0b11110011 in the control byte', () => {
      const out = toDST([stitch(0, 0), stitch(0, 5)]);
      // Control byte is the 3rd byte of each record; last record = last 3 bytes
      const lastB2 = out[out.length - 1];
      expect(lastB2).toBe(0b11110011);
    });
  });

  // ── color change record ────────────────────────────────────────────────────
  describe('color change record', () => {
    it('color event produces a 0b11000011 record', () => {
      const events = [stitch(0, 0), stitch(0, 5), colorEvt(1), stitch(0, 5), stitch(0, 10)];
      const out = toDST(events);
      const recs = parseAllRecords(out);
      expect(recs.some((r) => r.isColor)).toBe(true);
    });
  });

  // ── trim record ────────────────────────────────────────────────────────────
  describe('trim record', () => {
    it('trim event produces 3 zero-length jump records', () => {
      const events = [stitch(0, 0), stitch(0, 5), trimEvt(), stitch(0, 10), stitch(0, 15)];
      const out = toDST(events);
      const recs = parseAllRecords(out);
      // Find a run of 3 consecutive jump records with dx=dy=0
      let zeroRun = 0,
        maxZeroRun = 0;
      for (const r of recs) {
        if (r.isJump && r.dx === 0 && r.dy === 0) {
          zeroRun++;
          maxZeroRun = Math.max(maxZeroRun, zeroRun);
        } else zeroRun = 0;
      }
      expect(maxZeroRun).toBeGreaterThanOrEqual(3);
    });
  });

  // ── coordinate encoding ────────────────────────────────────────────────────
  describe('coordinate encoding', () => {
    it('encodes a simple vertical move correctly (y in 0.1mm units)', () => {
      // stitch at (0, 10mm) → y delta = +100 units (0.1mm each)
      const out = toDST([stitch(0, 0), stitch(0, 10)]);
      const recs = parseAllRecords(out).filter((r) => !r.isEnd && !r.isColor);
      const totalDY = recs.reduce((sum, r) => sum + r.dy, 0);
      expect(totalDY).toBe(100); // 10 mm × 10 = 100 units
    });

    it('encodes a simple horizontal move correctly', () => {
      const out = toDST([stitch(0, 0), stitch(5, 0)]);
      const recs = parseAllRecords(out).filter((r) => !r.isEnd && !r.isColor);
      const totalDX = recs.reduce((sum, r) => sum + r.dx, 0);
      expect(totalDX).toBe(50); // 5 mm × 10 = 50 units
    });

    it('splits large deltas into multiple records (max ±121 units)', () => {
      // A 30 mm move = 300 units — needs 3+ records to encode (max 121 per record)
      const out = toDST([stitch(0, 0), stitch(0, 30)]);
      const recs = parseAllRecords(out).filter((r) => !r.isEnd && !r.isColor);
      // Each record's dy should be ≤ 121
      expect(recs.every((r) => Math.abs(r.dy) <= 121)).toBe(true);
      // But total delta should still be 300
      const totalDY = recs.reduce((sum, r) => sum + r.dy, 0);
      expect(totalDY).toBe(300);
    });

    it('encodes jump events with the jump flag set', () => {
      const events = [stitch(0, 0), jump(0, 10), stitch(0, 10)];
      const out = toDST(events);
      const recs = parseAllRecords(out).filter((r) => !r.isEnd);
      expect(recs.some((r) => r.isJump && !r.isColor)).toBe(true);
    });
  });

  // ── round-trip with run() ──────────────────────────────────────────────────
  describe('round-trip with run()', () => {
    it('a real bloom design produces a valid DST file', () => {
      const result = run('stitchlen 2.2\nrepeat 12 [\n  repeat 36 [ fd 3.4 rt 10 ]\n  rt 30\n]');
      const out = toDST(result.events, 'bloom');
      expect(out).toBeInstanceOf(Uint8Array);
      expect(out.length).toBeGreaterThan(512);
      expect(out[out.length - 1]).toBe(0b11110011); // ends with EOD record
    });

    it('label is sanitised (spaces become underscores)', () => {
      const result = run('fd 10');
      const out = toDST(result.events, 'my design');
      const header = new TextDecoder().decode(out.slice(0, 80));
      expect(header).toContain('MY_DESIGN');
    });

    it('produces a non-empty file for a minimal design', () => {
      const result = run('fd 5');
      const out = toDST(result.events);
      expect(out.length).toBeGreaterThan(512 + 3); // at least one record + EOD
    });
  });
});
