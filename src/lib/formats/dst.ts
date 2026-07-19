// ============================================================
// Tajima DST encoder
// Produces a valid binary .DST file from a stitch event stream.
// No DOM dependencies.
// ============================================================

import type { ExportMetadata, StitchEvent } from '../core/types.ts';

function dstBit(b: number) {
  return 1 << b;
}

function dstEncodeDelta(x: number, y: number, jump: boolean): [number, number, number] {
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  b2 |= dstBit(0) | dstBit(1);
  if (jump) b2 |= dstBit(7);
  if (x > 40) {
    b2 |= dstBit(2);
    x -= 81;
  }
  if (x < -40) {
    b2 |= dstBit(3);
    x += 81;
  }
  if (y > 40) {
    b2 |= dstBit(5);
    y -= 81;
  }
  if (y < -40) {
    b2 |= dstBit(4);
    y += 81;
  }
  if (x > 13) {
    b1 |= dstBit(2);
    x -= 27;
  }
  if (x < -13) {
    b1 |= dstBit(3);
    x += 27;
  }
  if (y > 13) {
    b1 |= dstBit(5);
    y -= 27;
  }
  if (y < -13) {
    b1 |= dstBit(4);
    y += 27;
  }
  if (x > 4) {
    b0 |= dstBit(2);
    x -= 9;
  }
  if (x < -4) {
    b0 |= dstBit(3);
    x += 9;
  }
  if (y > 4) {
    b0 |= dstBit(5);
    y -= 9;
  }
  if (y < -4) {
    b0 |= dstBit(4);
    y += 9;
  }
  if (x > 1) {
    b1 |= dstBit(0);
    x -= 3;
  }
  if (x < -1) {
    b1 |= dstBit(1);
    x += 3;
  }
  if (y > 1) {
    b1 |= dstBit(7);
    y -= 3;
  }
  if (y < -1) {
    b1 |= dstBit(6);
    y += 3;
  }
  if (x > 0) {
    b0 |= dstBit(0);
    x -= 1;
  }
  if (x < 0) {
    b0 |= dstBit(1);
    x += 1;
  }
  if (y > 0) {
    b0 |= dstBit(7);
    y -= 1;
  }
  if (y < 0) {
    b0 |= dstBit(6);
    y += 1;
  }
  if (x !== 0 || y !== 0) throw new Error(`DST encode residual ${x},${y}`);
  return [b0, b1, b2];
}

export function toDST(
  events: StitchEvent[],
  label?: string,
  metadata?: ExportMetadata,
): Uint8Array {
  const records: [number, number, number][] = [];
  let cx = 0,
    cy = 0;
  let started = false;
  let recStitches = 0,
    recColors = 0;
  let minX = 0,
    maxX = 0,
    minY = 0,
    maxY = 0;

  function emitMove(tx: number, ty: number, jump: boolean) {
    let dx = tx - cx,
      dy = ty - cy;
    do {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 121));
      const sx = steps > 1 ? Math.round(dx / steps) : dx;
      const sy = steps > 1 ? Math.round(dy / steps) : dy;
      records.push(dstEncodeDelta(sx, sy, jump));
      recStitches++;
      cx += sx;
      cy += sy;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      dx = tx - cx;
      dy = ty - cy;
    } while (dx !== 0 || dy !== 0);
  }

  for (const e of events) {
    if (e.t === 'mark') continue; // debug pins are never exported
    if (e.t === 'color') {
      records.push([0, 0, 0b11000011]);
      recColors++;
      continue;
    }
    if (e.t === 'trim') {
      for (let i = 0; i < 3; i++) records.push(dstEncodeDelta(0, 0, true));
      continue;
    }
    const tx = Math.round(e.x * 10),
      ty = Math.round(e.y * 10);
    if (!started) {
      started = true;
      if (e.t === 'jump') {
        emitMove(tx, ty, true);
        continue;
      }
    }
    emitMove(tx, ty, e.t === 'jump');
  }
  records.push([0, 0, 0b11110011]); // end of design

  // 512-byte header
  const field = (s: string) => s + '\r';
  const num = (v: number, width: number) => {
    let s = String(Math.round(v));
    while (s.length < width) s = ' ' + s;
    return s;
  };
  const signedNum = (v: number, width: number) => {
    const sign = v < 0 ? '-' : '+';
    let s = String(Math.abs(Math.round(v)));
    while (s.length < width) s = ' ' + s;
    return sign + s;
  };

  let name = (label || 'NEEDLESCRIPT')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 16);
  while (name.length < 16) name += ' ';

  let header = '';
  header += field('LA:' + name);
  header += field('ST:' + num(recStitches, 7));
  header += field('CO:' + num(recColors, 3));
  header += field('+X:' + num(Math.abs(maxX), 5));
  header += field('-X:' + num(Math.abs(minX), 5));
  header += field('+Y:' + num(Math.abs(maxY), 5));
  header += field('-Y:' + num(Math.abs(minY), 5));
  header += field('AX:' + signedNum(cx, 5));
  header += field('AY:' + signedNum(cy, 5));
  header += field('MX:' + signedNum(0, 5));
  header += field('MY:' + signedNum(0, 5));
  header += field('PD:******');
  if (metadata?.machineProfile?.source === 'run-options') {
    const profileName = metadata.machineProfile.name
      .toUpperCase()
      .replace(/[^A-Z0-9_. -]/g, '_')
      .slice(0, 40);
    header += field('NS:' + profileName);
  }

  const bytes = new Uint8Array(512 + records.length * 3);
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i);
  bytes[header.length] = 0x1a;
  for (let i = header.length + 1; i < 512; i++) bytes[i] = 0x20;
  let o = 512;
  for (const r of records) {
    bytes[o++] = r[0];
    bytes[o++] = r[1];
    bytes[o++] = r[2];
  }
  return bytes;
}
