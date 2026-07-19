import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from '../ai-prompt.ts';
import { EMBROIDERY_MODE_REGISTRIES } from '../embroidery-registry.ts';
import { FILL_CONSTRUCTION_MODE_REGISTRIES } from '../fill-profile.ts';
import { SATIN_CONSTRUCTION_MODE_REGISTRIES } from '../satin-profile.ts';
import { FILL_UNDERLAY_PASS_KINDS, SATIN_UNDERLAY_PASS_KINDS } from '../underlay-profile.ts';
import { PLAN_MODES } from '../travel-planner.ts';
import { PREFLIGHT_MODES } from '../preflight.ts';

const EMBROIDERY_GUIDANCE_COMMANDS = [
  'stitchscope',
  'underlaypasses',
  'underlaylen',
  'underlayinset',
  'underlayspacing',
  'fillunderlaypasses',
  'fillunderlaylen',
  'fillunderlayinset',
  'fillunderlayspacing',
  'fillunderlayangle',
  'fillinset',
  'filledgerun',
  'filledgeshort',
  'fillstagger',
  'fillstaggeramount',
  'fillconnect',
  'satincap',
  'satincaplen',
  'satinjoin',
  'satincorner',
  'satinwide',
  'satinmaxwidth',
  'satinsplitoverlap',
  'planbarrier',
  'atomic',
  'routegroup',
  'fabricgrain',
  'fabricstretch',
  'threadprofile',
  'threadwidth',
  'needle',
  'stabilizer',
  'topping',
  'compensation',
  'preflight',
] as const;

describe('NeedleScript AI system prompt', () => {
  it('documents every embroidery-results command and registered mode', () => {
    for (const command of EMBROIDERY_GUIDANCE_COMMANDS) expect(SYSTEM_PROMPT).toContain(command);

    const registries = [
      ...Object.entries(EMBROIDERY_MODE_REGISTRIES),
      ...Object.entries(FILL_CONSTRUCTION_MODE_REGISTRIES),
      ...Object.entries(SATIN_CONSTRUCTION_MODE_REGISTRIES),
      ['plan', PLAN_MODES],
      ['preflight', PREFLIGHT_MODES],
      ['underlaypasses', SATIN_UNDERLAY_PASS_KINDS],
      ['fillunderlaypasses', FILL_UNDERLAY_PASS_KINDS],
    ] as const;

    for (const [command, modes] of registries) {
      for (const mode of modes) {
        expect(SYSTEM_PROMPT, `${command} should document ${mode}`).toContain(mode);
      }
    }
  });

  it('requires explicit intent for geometry-changing split and compensation policies', () => {
    expect(SYSTEM_PROMPT).toContain(
      "Never turn on satinwide 'split' merely because a column is wide",
    );
    expect(SYSTEM_PROMPT).toContain('Never enable directional compensation automatically');
    expect(SYSTEM_PROMPT).toContain("Keep `satinwide 'warn'` and `compensation 'legacy'` unless");
  });
});
