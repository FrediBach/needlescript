import { NeedlescriptError } from '../core/errors.ts';
import { num } from './list.ts';
import type { Val } from './list.ts';
import * as gm from '../geometry/genmath.ts';
import { apply } from '../geometry/affine.ts';
import type { RunContext } from './context.ts';

export function initQueryFunc(ctx: RunContext): void {
  ctx.queryFunc = (name: string, args: Val[], line: number | undefined): Val => {
    ctx.m.usedQuery = true;
    // Local → hoop through the affine transform stack (warp is not inverted).
    const hoop = (i: number): [number, number] => {
      const p = gm.toPoint(args[i], name, line);
      return apply(ctx.m.ctm, p[0], p[1]);
    };
    const point = (p: [number, number]) => ctx.allocList([p[0], p[1]], line);

    switch (name) {
      case 'coverat': {
        const [hx, hy] = hoop(0);
        if (args.length >= 2) {
          const r = num(args[1], 'coverat', line);
          if (!(r >= 0)) throw new NeedlescriptError('coverat radius must be 0 or more', line);
          ctx.tickN(Math.max(1, Math.ceil(Math.PI * r * r)), line);
          return ctx.m.density.coverAvg(hx, hy, r);
        }
        ctx.tick(line);
        return ctx.m.density.coverAt(hx, hy);
      }
      case 'countat': {
        const [hx, hy] = hoop(0);
        ctx.tick(line);
        return ctx.m.density.countAt(hx, hy);
      }
      case 'nearestsewn': {
        const [hx, hy] = hoop(0);
        ctx.tickN(8, line);
        const p = ctx.m.density.nearestSewn(hx, hy);
        return p ? point(p) : ctx.allocList([], line);
      }
      case 'sewnwithin': {
        const [hx, hy] = hoop(0);
        const r = num(args[1], 'sewnwithin', line);
        if (!(r >= 0)) throw new NeedlescriptError('sewnwithin radius must be 0 or more', line);
        const found = ctx.m.density.sewnWithin(hx, hy, r);
        ctx.tickN(found.length + 4, line);
        return ctx.allocList(
          found.map((p) => point(p) as Val),
          line,
        );
      }
      case 'stitchedpoints': {
        const pts = ctx.m.density.snapshot();
        if (pts.length > ctx.m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `stitchedpoints: ${pts.length.toLocaleString('en-US')} penetrations exceeds the list limit ${ctx.m.effectiveLimits.maxListLen.toLocaleString('en-US')}`,
            line,
          );
        ctx.tickN(pts.length, line);
        return ctx.allocList(
          pts.map((p) => point(p) as Val),
          line,
        );
      }
    }
    throw new NeedlescriptError(`Unknown query ${name}`, line);
  };
}
