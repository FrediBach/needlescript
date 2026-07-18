import { DEBUGX_SOURCE } from './debugx.ns.ts';
import { LISTX_SOURCE } from './listx.ns.ts';
import { LAYOUT_SOURCE } from './layout.ns.ts';
import { MATHX_SOURCE } from './mathx.ns.ts';
import { PATHOPS_SOURCE } from './pathops.ns.ts';
import { REGIONS_SOURCE } from './regions.ns.ts';
import { SHAPES_SOURCE } from './shapes.ns.ts';
import { STITCHCRAFT_SOURCE } from './stitchcraft.ns.ts';
import { TEXTURES_SOURCE } from './textures.ns.ts';

const STANDARD_MODULES: Readonly<Record<string, string>> = {
  'std.debugx': DEBUGX_SOURCE,
  'std.listx': LISTX_SOURCE,
  'std.layout': LAYOUT_SOURCE,
  'std.mathx': MATHX_SOURCE,
  'std.pathops': PATHOPS_SOURCE,
  'std.regions': REGIONS_SOURCE,
  'std.shapes': SHAPES_SOURCE,
  'std.stitchcraft': STITCHCRAFT_SOURCE,
  'std.textures': TEXTURES_SOURCE,
};

export interface StandardLibraryProcedure {
  moduleId: string;
  name: string;
  params: readonly string[];
}

function exportedProcedures(moduleId: string, source: string): StandardLibraryProcedure[] {
  const procedures: StandardLibraryProcedure[] = [];
  const modernDefinition = /\bexport\s+def\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi;
  const classicDefinition = /\bexport\s+to\s+([a-z_][a-z0-9_]*)((?:[ \t]+:[a-z_][a-z0-9_]*)*)/gi;
  let match: RegExpExecArray | null;

  while ((match = modernDefinition.exec(source)) !== null) {
    const params = match[2].trim();
    procedures.push({
      moduleId,
      name: match[1].toLowerCase(),
      params: Object.freeze(params ? params.split(',').map((param) => param.trim()) : []),
    });
  }

  while ((match = classicDefinition.exec(source)) !== null) {
    const rawParams = match[2].trim();
    procedures.push({
      moduleId,
      name: match[1].toLowerCase(),
      params: Object.freeze(rawParams ? rawParams.split(/\s+/).map((param) => param.slice(1)) : []),
    });
  }

  return procedures;
}

/** Procedure signatures exposed by the bundled modules, derived from their source definitions. */
export const STANDARD_LIBRARY_PROCEDURES: readonly StandardLibraryProcedure[] = Object.freeze(
  Object.entries(STANDARD_MODULES).flatMap(([moduleId, source]) =>
    exportedProcedures(moduleId, source),
  ),
);

/** Resolve a bundled standard-library module without filesystem or network access. */
export function resolveStandardModule(moduleId: string): string | undefined {
  return STANDARD_MODULES[moduleId];
}
