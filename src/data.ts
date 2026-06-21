// Shared constants for the NeedleScript playground UI

import bloomRaw         from '../examples/bloom.ns?raw';
import wreathRaw        from '../examples/wreath.ns?raw';
import wanderRaw        from '../examples/wander.ns?raw';
import starRaw          from '../examples/star.ns?raw';
import badgeRaw         from '../examples/badge.ns?raw';
import samplerRaw       from '../examples/sampler.ns?raw';
import wavesRaw         from '../examples/waves.ns?raw';
import treeRaw          from '../examples/tree.ns?raw';
import fernRaw          from '../examples/fern.ns?raw';
import flowRaw          from '../examples/flow.ns?raw';
import shellRaw         from '../examples/shell.ns?raw';
import patchRaw         from '../examples/patch.ns?raw';
import meadowRaw        from '../examples/meadow.ns?raw';
import echoRaw          from '../examples/echo.ns?raw';
import shatterRaw       from '../examples/shatter.ns?raw';
import lorenzRaw        from '../examples/lorenz-attractor.ns?raw';
import meanderRaw       from '../examples/meandering-spiral.ns?raw';
import snowflakeRaw     from '../examples/snowflake.ns?raw';
import orbitsRaw        from '../examples/threaded-orbits.ns?raw';
import waveformsRaw     from '../examples/waveforms.ns?raw';
import fillRaw          from '../examples/fill.ns?raw';
import linesRaw         from '../examples/lines.ns?raw';
import vennRaw          from '../examples/venn.ns?raw';
import contourRaw       from '../examples/contour.ns?raw';
import spirographRaw    from '../examples/spirograph.ns?raw';
import complexspirographRaw from '../examples/complex-spirograph.ns?raw';
import disturbanceRaw   from '../examples/disturbance.ns?raw';
import lfowavesRaw   from '../examples/lfowaves.ns?raw';

export const THREADS: string[] = [
  '#C8472F', // 0 — red
  '#31604F', // 1 — forest
  '#3A4E8C', // 2 — blue
  '#D9A441', // 3 — gold
  '#8C4A6B', // 4 — mauve
  '#2B2B2B', // 5 — black
  '#5E8F8C', // 6 — teal
  '#B8651B', // 7 — amber
];

export interface HoopConfig {
  id: string;
  label: string;
  widthMM: number;
  heightMM: number;
  shape: 'circle' | 'oval' | 'rectangle';
}

export const HOOPS: HoopConfig[] = [
  { id: 'round-100',    label: '100 mm round',    widthMM: 100, heightMM: 100, shape: 'circle'    },
  { id: 'round-130',    label: '130 mm round',    widthMM: 130, heightMM: 130, shape: 'circle'    },
  { id: 'round-150',    label: '150 mm round',    widthMM: 150, heightMM: 150, shape: 'circle'    },
  { id: 'round-200',    label: '200 mm round',    widthMM: 200, heightMM: 200, shape: 'circle'    },
  { id: 'oval-120x75',  label: '120×75 mm oval',  widthMM: 120, heightMM:  75, shape: 'oval'      },
  { id: 'oval-150x100', label: '150×100 mm oval', widthMM: 150, heightMM: 100, shape: 'oval'      },
  { id: 'rect-100',     label: '100×100 mm',      widthMM: 100, heightMM: 100, shape: 'rectangle' },
  { id: 'rect-180x130', label: '180×130 mm',      widthMM: 180, heightMM: 130, shape: 'rectangle' },
];

export const DEFAULT_HOOP: HoopConfig = HOOPS[0];

// All examples loaded from .ns files in /examples.
// Keys are the short display names used as labels and as lookup keys in App.tsx.
export const EXAMPLES: Record<string, string> = {
  'bloom':         bloomRaw,
  'wreath':        wreathRaw,
  'wander':        wanderRaw,
  'star':          starRaw,
  'badge':         badgeRaw,
  'sampler':       samplerRaw,
  'waves':         wavesRaw,
  'shell':         shellRaw,
  'tree':          treeRaw,
  'fern':          fernRaw,
  'flow':          flowRaw,
  'patch':         patchRaw,
  'lorenz':        lorenzRaw,
  'meander':       meanderRaw,
  'snowflake':     snowflakeRaw,
  'orbits':        orbitsRaw,
  'waveforms':     waveformsRaw,
  'venn':          vennRaw,
  'spirograph 1':  spirographRaw,
  'spirograph 2':  complexspirographRaw,
  'disturbance':   disturbanceRaw,
  'lfowaves':   lfowavesRaw,
  'echo':          echoRaw,
  'shatter':       shatterRaw,
  'meadow':        meadowRaw,
  'contour':       contourRaw,
  'lines':         linesRaw,
  'fill':          fillRaw,
};

// Complexity tiers — used to group examples in the UI picker.
export const EXAMPLE_TIERS: { label: string; keys: string[] }[] = [
  {
    label: 'intro',
    keys: ['bloom', 'wreath', 'wander', 'star', 'badge', 'sampler', 'waves', 'shell'],
  },
  {
    label: 'intermediate',
    keys: ['tree', 'fern', 'flow', 'patch', 'lorenz', 'meander', 'snowflake', 'orbits', 'waveforms', 'venn', 'spirograph 1', 'spirograph 2', 'disturbance', 'lfowaves'],
  },
  {
    label: 'advanced',
    keys: ['echo', 'shatter', 'meadow', 'contour', 'lines', 'fill'],
  },
];
