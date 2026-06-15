import { describe, it, expect } from 'vitest';
import { toEXP } from '../exp.ts';
import { run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

function stitch(x: number, y: number, c = 0): StitchEvent { return { t: 'stitch', x, y, c }; }
function jump(x: number, y: number, c = 0): StitchEvent   { return { t: 'jump',   x, y, c }; }
function colorEvt(c = 0): StitchEvent                      { return { t: 'color',  x: 0, y: 0, c }; }
function trimEvt(): StitchEvent                            { return { t: 'trim',   x: 0, y: 0, c: 0 }; }
function markEvt(): StitchEvent                            { return { t: 'mark',   x: 0, y: 0, c: 0 }; }

// ── EXP record parser ────────────────────────────────────────────────────────
interface ExpRecord {
  type: 'stitch' | 'jump' | 'trim' | 'color';
  dx: number;
  dy: number;
}

/** Interpret a raw coordinate byte as a signed delta (-127..127). */
function signedByte(b: number): number {
  return b > 127 ? b - 256 : b;
}

function parseExpRecords(buf: Uint8Array): ExpRecord[] {
  const records: ExpRecord[] = [];
  let i = 0;
  while (i < buf.length) {
    const b0 = buf[i];
    if (b0 === 0x80) {
      const cmd = buf[i + 1];
      if (cmd === 0x04) {
        // Jump: 0x80 0x04 [dx] [dy]
        const dx = signedByte(buf[i + 2]);
        const dy = signedByte(buf[i + 3]);
        records.push({ type: 'jump', dx, dy });
        i += 4;
      } else if (cmd === 0x01) {
        // Colour change: 0x80 0x01 0x00 0x00
        records.push({ type: 'color', dx: 0, dy: 0 });
        i += 4;
      } else if (cmd === 0x80) {
        // Trim: 0x80 0x80 0x07 0x00
        records.push({ type: 'trim', dx: 0, dy: 0 });
        i += 4;
      } else {
        i += 2; // unknown control, skip
      }
    } else {
      // Stitch: [dx] [dy]
      const dx = signedByte(b0);
      const dy = signedByte(buf[i + 1]);
      records.push({ type: 'stitch', dx, dy });
      i += 2;
    }
  }
  return records;
}

// ── file structure ────────────────────────────────────────────────────────────
describe('toEXP', () => {
  describe('file structure', () => {
    it('returns a Uint8Array', () => {
      expect(toEXP([stitch(0, 0), stitch(0, 5)])).toBeInstanceOf(Uint8Array);
    });

    it('has no header — file starts directly with stitch data', () => {
      const out = toEXP([stitch(0, 0), stitch(5, 5)]);
      // First two bytes should be the dx/dy of the stitch (not a 0x80 control byte)
      expect(out[0]).not.toBe(0x80); // stitch byte, not a control marker
    });

    it('label parameter is accepted without error (EXP has no header)', () => {
      expect(() => toEXP([stitch(0, 0), stitch(0, 5)], 'mydesign')).not.toThrow();
    });
  });

  // ── special records ───────────────────────────────────────────────────────
  describe('special records', () => {
    it('color event produces 0x80 0x01 colour-change record', () => {
      const events = [stitch(0, 0), stitch(0, 5), colorEvt(1), stitch(0, 5), stitch(0, 10)];
      const out = toEXP(events);
      const records = parseExpRecords(out);
      expect(records.some(r => r.type === 'color')).toBe(true);
    });

    it('trim event produces 0x80 0x80 trim record', () => {
      const events = [stitch(0, 0), stitch(0, 5), trimEvt(), stitch(0, 10)];
      const out = toEXP(events);
      const records = parseExpRecords(out);
      expect(records.some(r => r.type === 'trim')).toBe(true);
    });

    it('jump event produces 0x80 0x04 jump record', () => {
      const events = [stitch(0, 0), jump(0, 10), stitch(0, 10)];
      const out = toEXP(events);
      const records = parseExpRecords(out);
      expect(records.some(r => r.type === 'jump')).toBe(true);
    });

    it('mark events are silently dropped', () => {
      const withMark    = toEXP([stitch(0, 0), markEvt(), stitch(0, 5)]);
      const withoutMark = toEXP([stitch(0, 0), stitch(0, 5)]);
      expect(withMark).toEqual(withoutMark);
    });
  });

  // ── coordinate encoding ────────────────────────────────────────────────────
  describe('coordinate encoding', () => {
    it('encodes a vertical stitch correctly (y in 0.1 mm units)', () => {
      // 10 mm → 100 units; split into records of ≤ 127 each
      const out = toEXP([stitch(0, 0), stitch(0, 10)]);
      const records = parseExpRecords(out).filter(r => r.type === 'stitch');
      const totalDY = records.reduce((s, r) => s + r.dy, 0);
      expect(totalDY).toBe(100);
    });

    it('encodes a horizontal stitch correctly', () => {
      const out = toEXP([stitch(0, 0), stitch(5, 0)]);
      const records = parseExpRecords(out).filter(r => r.type === 'stitch');
      const totalDX = records.reduce((s, r) => s + r.dx, 0);
      expect(totalDX).toBe(50); // 5 mm × 10 = 50 units
    });

    it('never produces a coordinate byte equal to 0x80 (reserved)', () => {
      // Exercise a real design — deltas must never be ±128
      const result = run('stitchlen 2.2\nrepeat 12 [\n  repeat 36 [ fd 3.4 rt 10 ]\n  rt 30\n]');
      const out = toEXP(result.events);
      for (let i = 0; i < out.length; ) {
        if (out[i] === 0x80) {
          // skip 4-byte control record
          i += 4;
        } else {
          // stitch [dx, dy] — neither byte should be 0x80
          expect(out[i]).not.toBe(0x80);
          expect(out[i + 1]).not.toBe(0x80);
          i += 2;
        }
      }
    });

    it('splits large deltas into multiple records (max 127 units each)', () => {
      // 30 mm = 300 units — must be split into multiple records
      const out = toEXP([stitch(0, 0), stitch(0, 30)]);
      const records = parseExpRecords(out).filter(r => r.type === 'stitch');
      expect(records.length).toBeGreaterThan(1); // needs at least 3 records
      expect(records.every(r => Math.abs(r.dy) <= 127)).toBe(true);
      const totalDY = records.reduce((s, r) => s + r.dy, 0);
      expect(totalDY).toBe(300);
    });

    it('encodes negative deltas correctly as signed bytes', () => {
      // stitch(5,0) → dx=+50 from origin; stitch(0,0) → dx=−50 back.
      // The last stitch record's dx should be −50.
      const out = toEXP([stitch(5, 0), stitch(0, 0)]);
      const records = parseExpRecords(out).filter(r => r.type === 'stitch');
      expect(records.at(-1)?.dx).toBe(-50); // last move: −5 mm × 10 = −50 units
    });
  });

  // ── round-trip with run() ─────────────────────────────────────────────────
  describe('round-trip with run()', () => {
    it('a real bloom design produces a valid EXP file', () => {
      const result = run('stitchlen 2.2\nrepeat 12 [\n  repeat 36 [ fd 3.4 rt 10 ]\n  rt 30\n]');
      const out = toEXP(result.events, 'bloom');
      expect(out).toBeInstanceOf(Uint8Array);
      expect(out.length).toBeGreaterThan(0);
    });

    it('produces a non-empty file for a minimal design', () => {
      const result = run('fd 5');
      const out = toEXP(result.events);
      expect(out.length).toBeGreaterThan(0);
    });

    it('all records in a real design are parseable without ambiguity', () => {
      const result = run('stitchlen 2.5\nrepeat 6 [ fd 10 rt 60 ]');
      const out = toEXP(result.events);
      // Should parse all bytes without error (no unexpected 0x80 in stitch coords)
      expect(() => parseExpRecords(out)).not.toThrow();
      const records = parseExpRecords(out);
      expect(records.length).toBeGreaterThan(0);
    });
  });
});
