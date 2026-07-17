import { TEXTURES_SOURCE } from './textures.ns.ts';

const STANDARD_MODULES: Readonly<Record<string, string>> = {
  'std.textures': TEXTURES_SOURCE,
};

/** Resolve a bundled standard-library module without filesystem or network access. */
export function resolveStandardModule(moduleId: string): string | undefined {
  return STANDARD_MODULES[moduleId];
}
