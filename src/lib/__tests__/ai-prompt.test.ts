import { describe, expect, it } from 'vitest';
import {
  SYSTEM_PROMPT,
  buildPhysicsFeedback,
  buildPhysicsRetryMessages,
  buildRetryMessages,
  type ChatMessage,
} from '../editor/ai-prompt.ts';
import type { PhysicsDiagnostic, PhysicsReport } from '../core/types.ts';
import { EMBROIDERY_MODE_REGISTRIES } from '../embroidery/embroidery-registry.ts';
import { FILL_CONSTRUCTION_MODE_REGISTRIES } from '../embroidery/fill-profile.ts';
import { SATIN_CONSTRUCTION_MODE_REGISTRIES } from '../embroidery/satin-profile.ts';
import {
  FILL_UNDERLAY_PASS_KINDS,
  SATIN_UNDERLAY_PASS_KINDS,
} from '../embroidery/underlay-profile.ts';
import { PLAN_MODES } from '../embroidery/travel-planner.ts';
import { PREFLIGHT_MODES } from '../embroidery/preflight.ts';

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

const diagnostic = (overrides: Partial<PhysicsDiagnostic> = {}): PhysicsDiagnostic => ({
  id: 'diagnostic-1',
  fingerprint: 'fingerprint-1',
  code: 'coverage.density-hotspot',
  category: 'coverage',
  severity: 'warning',
  evidence: 'heuristic',
  thresholdVersion: 'physics-thresholds-v2',
  evidenceReferences: [
    {
      id: 'physical-sewout',
      version: '1',
      title: 'Physical sew-out',
      kind: 'physical-protocol',
      status: 'pending',
      documentationId: 'physics.sewout',
    },
  ],
  title: 'Dense thread coverage',
  explanation: 'The modeled coverage exceeds the preferred layer count.',
  methodology: 'Coverage cells are sampled in hoop space.',
  limitations: ['Fabric response still requires a test sew-out.'],
  measurements: [
    {
      label: 'coverage',
      value: 7,
      unit: 'layers',
      threshold: 5,
      comparison: 'above',
    },
  ],
  sourceLocations: [{ line: 2, startColumn: 1, endColumn: 10, role: 'primary' }],
  geometry: [],
  playbackRanges: [],
  remedies: [
    {
      id: 'coverage.reduce-overlap',
      title: 'Reduce overlap',
      description: 'Increase spacing or remove coincident passes.',
      kind: 'guidance',
    },
  ],
  ...overrides,
});

const physicsReport = (diagnostics: PhysicsDiagnostic[]): PhysicsReport => ({
  version: 2,
  catalogVersion: 2,
  thresholdVersion: 'physics-thresholds-v2',
  diagnostics,
  assumptions: [
    {
      key: 'fabric',
      label: 'Fabric',
      value: 'medium woven',
      source: 'default',
      effect: 'Uses the default material response.',
    },
  ],
  summary: {
    error: diagnostics.filter(({ severity }) => severity === 'error').length,
    warning: diagnostics.filter(({ severity }) => severity === 'warning').length,
    info: diagnostics.filter(({ severity }) => severity === 'info').length,
  },
  profile: { name: 'default' } as PhysicsReport['profile'],
  material: {} as PhysicsReport['material'],
  policy: 'off',
});

describe('NeedleScript AI review feedback', () => {
  const originalMessages: ChatMessage[] = [{ role: 'system', content: 'NeedleScript reference' }];

  it('links actionable physics findings to exact source and construction remedies', () => {
    const feedback = buildPhysicsFeedback(
      physicsReport([diagnostic()]),
      'setpensize 2\nrepeat 4 [ fd 10 ]',
    );

    expect(feedback).not.toBeNull();
    expect(feedback!.counts).toEqual({ error: 0, warning: 1 });
    expect(feedback!.content).toContain('line 2:1-10');
    expect(feedback!.content).toContain('2 | repeat 4 [ fd 10 ]');
    expect(feedback!.content).toContain('coverage 7 layers (above threshold 5 layers)');
    expect(feedback!.content).toContain('Reduce overlap');
    expect(feedback!.content).toContain('physical validation is pending');
  });

  it('does not automatically rewrite for informational notes', () => {
    expect(
      buildPhysicsFeedback(physicsReport([diagnostic({ severity: 'info' })]), 'fd 10'),
    ).toBeNull();
  });

  it('bounds review size while prioritizing blockers over risks', () => {
    const diagnostics = Array.from({ length: 10 }, (_, index) =>
      diagnostic({
        id: `diagnostic-${index}`,
        fingerprint: `fingerprint-${index}`,
        code: `test.finding-${index}`,
        severity: index === 9 ? 'error' : 'warning',
      }),
    );
    const feedback = buildPhysicsFeedback(physicsReport(diagnostics), 'fd 10')!;

    expect(feedback.content).toContain('Finding 1\n[ERROR] test.finding-9');
    expect(feedback.content).toContain('2 lower-priority finding(s) omitted');
    expect(feedback.content).not.toContain('Finding 9');
  });

  it('asks for a complete revision without weakening or silencing diagnostics', () => {
    const feedback = buildPhysicsFeedback(physicsReport([diagnostic()]), 'fd 10')!;
    const messages = buildPhysicsRetryMessages(originalMessages, 'fd 10', feedback);

    expect(messages.at(-2)).toEqual({ role: 'assistant', content: 'fd 10' });
    expect(messages.at(-1)?.content).toContain('Do not hide findings by weakening limits');
    expect(messages.at(-1)?.content).toContain('Return ONLY the complete corrected');
  });

  it('includes the reported source line in compile-error retries', () => {
    const messages = buildRetryMessages(
      originalMessages,
      'fd 10\nunknowncommand 2',
      'Unknown command (line 2)',
      2,
    );

    expect(messages.at(-1)?.content).toContain('Reported source line: 2');
    expect(messages.at(-1)?.content).toContain('2 | unknowncommand 2');
  });
});
