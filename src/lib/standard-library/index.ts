import { LISTX_SOURCE } from './listx.ns.ts';
import { LAYOUT_SOURCE } from './layout.ns.ts';
import { MATHX_SOURCE } from './mathx.ns.ts';
import { PATHOPS_SOURCE } from './pathops.ns.ts';
import { REGIONS_SOURCE } from './regions.ns.ts';
import { SHAPES_SOURCE } from './shapes.ns.ts';
import { TEXTURES_SOURCE } from './textures.ns.ts';

const STANDARD_MODULES: Readonly<Record<string, string>> = {
  'std.listx': LISTX_SOURCE,
  'std.layout': LAYOUT_SOURCE,
  'std.mathx': MATHX_SOURCE,
  'std.pathops': PATHOPS_SOURCE,
  'std.regions': REGIONS_SOURCE,
  'std.shapes': SHAPES_SOURCE,
  'std.textures': TEXTURES_SOURCE,
};

/** Resolve a bundled standard-library module without filesystem or network access. */
export function resolveStandardModule(moduleId: string): string | undefined {
  return STANDARD_MODULES[moduleId];
}
