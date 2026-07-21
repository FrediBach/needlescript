import type {
  DiagnosticGeometryRole,
  PhysicsDiagnosticCategory,
  PhysicsEvidence,
  PhysicsRemedy,
  PreflightSeverity,
} from '../../core/types.ts';

export interface PhysicsDiagnosticCatalogEntry {
  code: string;
  category: PhysicsDiagnosticCategory;
  defaultSeverity: PreflightSeverity;
  evidence: PhysicsEvidence;
  geometryRole: DiagnosticGeometryRole;
  title: string;
  explanation: string;
  remedies: readonly PhysicsRemedy[];
  documentationId: string;
}

const guidance = (code: string, title: string, description: string): PhysicsRemedy => ({
  id: `${code}.guidance`,
  title,
  description,
  kind: 'guidance',
});

const context = (code: string, title: string, description: string): PhysicsRemedy => ({
  id: `${code}.context`,
  title,
  description,
  kind: 'context',
});

export const PHYSICS_DIAGNOSTIC_CATALOG = Object.freeze([
  {
    code: 'coverage.density-hotspot',
    category: 'coverage',
    defaultSeverity: 'warning',
    evidence: 'heuristic',
    geometryRole: 'hotspot',
    title: 'Dense thread coverage',
    explanation:
      'Overlapping thread coverage exceeds the configured layer threshold and may pucker the fabric or increase needle stress.',
    remedies: [
      guidance(
        'coverage.density-hotspot',
        'Reduce local coverage',
        'Reduce overlapping layers or increase stitch spacing in this area.',
      ),
    ],
    documentationId: 'physics.coverage.density-hotspot',
  },
  {
    code: 'penetration.same-hole-stack',
    category: 'penetration',
    defaultSeverity: 'warning',
    evidence: 'heuristic',
    geometryRole: 'penetration-cluster',
    title: 'Repeated same-hole penetrations',
    explanation:
      'Several stitches enter effectively the same needle hole, concentrating perforation and thread bulk.',
    remedies: [
      guidance(
        'penetration.same-hole-stack',
        'Separate the penetrations',
        'Offset or remove repeated penetrations through the same needle hole.',
      ),
    ],
    documentationId: 'physics.penetration.same-hole-stack',
  },
  {
    code: 'stitch.below-reliable-movement',
    category: 'stitch',
    defaultSeverity: 'warning',
    evidence: 'engine-derived',
    geometryRole: 'hotspot',
    title: 'Movement below reliable stitch length',
    explanation:
      'The stitch engine merged movements too short to form distinct, reliable needle placements.',
    remedies: [
      guidance(
        'stitch.below-reliable-movement',
        'Open the spacing',
        'Increase stitch spacing or simplify the construction around these points.',
      ),
    ],
    documentationId: 'physics.stitch.below-reliable-movement',
  },
  {
    code: 'hoop.field-overflow',
    category: 'hoop',
    defaultSeverity: 'warning',
    evidence: 'hard-limit',
    geometryRole: 'unreachable-extent',
    title: 'Design outside the sewable field',
    explanation:
      'One or more penetrations lie outside the hoop inset reserved for reliable sewing, but remain inside the physical hoop.',
    remedies: [
      guidance(
        'hoop.field-overflow',
        'Fit the sewable field',
        'Move or scale the design into the inset sewable field.',
      ),
    ],
    documentationId: 'physics.hoop.field-overflow',
  },
  {
    code: 'hoop.unreachable',
    category: 'hoop',
    defaultSeverity: 'error',
    evidence: 'hard-limit',
    geometryRole: 'unreachable-extent',
    title: 'Design outside the physical hoop',
    explanation:
      'One or more penetrations are outside the selected hoop and cannot be reached by that physical setup.',
    remedies: [
      guidance(
        'hoop.unreachable',
        'Fit the physical hoop',
        'Move or scale the design so every penetration is inside the physical hoop.',
      ),
    ],
    documentationId: 'physics.hoop.unreachable',
  },
  {
    code: 'satin.snag-risk',
    category: 'satin',
    defaultSeverity: 'warning',
    evidence: 'heuristic',
    geometryRole: 'envelope',
    title: 'Long satin span',
    explanation:
      'The configured or realized satin span exceeds the preferred unsupported thread length and may snag.',
    remedies: [
      guidance(
        'satin.snag-risk',
        'Shorten the satin span',
        'Reduce the satin width or rake, or split the column.',
      ),
    ],
    documentationId: 'physics.satin.snag-risk',
  },
  {
    code: 'machine.trim-manual',
    category: 'machine',
    defaultSeverity: 'info',
    evidence: 'machine-profile',
    geometryRole: 'travel',
    title: 'Manual trim required',
    explanation: 'The selected machine profile requires operator action at trim events.',
    remedies: [
      context(
        'machine.trim-manual',
        'Plan the operator pause',
        'Include the trim in the sew-out worksheet and pause at this point.',
      ),
    ],
    documentationId: 'physics.machine.trim-manual',
  },
  {
    code: 'machine.trim-unsupported',
    category: 'machine',
    defaultSeverity: 'error',
    evidence: 'machine-profile',
    geometryRole: 'travel',
    title: 'Trim operation unsupported',
    explanation: 'The selected machine profile cannot perform a trim event in this design.',
    remedies: [
      guidance(
        'machine.trim-unsupported',
        'Remove or support the trim',
        'Remove the trim or choose a local machine profile that supports it.',
      ),
    ],
    documentationId: 'physics.machine.trim-unsupported',
  },
  {
    code: 'machine.color-change-manual',
    category: 'machine',
    defaultSeverity: 'info',
    evidence: 'machine-profile',
    geometryRole: 'travel',
    title: 'Manual color change required',
    explanation: 'The selected machine profile requires operator action at color changes.',
    remedies: [
      context(
        'machine.color-change-manual',
        'Plan the operator pause',
        'Include the color change in the sew-out worksheet and pause at this point.',
      ),
    ],
    documentationId: 'physics.machine.color-change-manual',
  },
  {
    code: 'machine.color-change-unsupported',
    category: 'machine',
    defaultSeverity: 'error',
    evidence: 'machine-profile',
    geometryRole: 'travel',
    title: 'Color change unsupported',
    explanation: 'The selected machine profile cannot perform a color-change event in this design.',
    remedies: [
      guidance(
        'machine.color-change-unsupported',
        'Remove or support the color change',
        'Remove the color change or choose a local machine profile that supports it.',
      ),
    ],
    documentationId: 'physics.machine.color-change-unsupported',
  },
  {
    code: 'stitch.short-cluster',
    category: 'stitch',
    defaultSeverity: 'warning',
    evidence: 'machine-profile',
    geometryRole: 'hotspot',
    title: 'Cluster of short stitches',
    explanation:
      'Many consecutive stitches fall below the reliable movement range of the selected machine profile.',
    remedies: [
      guidance(
        'stitch.short-cluster',
        'Open the local spacing',
        'Increase local stitch spacing or simplify the path through this cluster.',
      ),
    ],
    documentationId: 'physics.stitch.short-cluster',
  },
  {
    code: 'path.reversal-cluster',
    category: 'path',
    defaultSeverity: 'warning',
    evidence: 'heuristic',
    geometryRole: 'hotspot',
    title: 'Repeated local reversals',
    explanation:
      'The stitch path repeatedly reverses within a small area, concentrating thread and perforations.',
    remedies: [
      guidance(
        'path.reversal-cluster',
        'Reduce the backtracking',
        'Reduce local backtracking or spread the reversals over a larger area.',
      ),
    ],
    documentationId: 'physics.path.reversal-cluster',
  },
  {
    code: 'penetration.near-hole-cluster',
    category: 'penetration',
    defaultSeverity: 'warning',
    evidence: 'heuristic',
    geometryRole: 'penetration-cluster',
    title: 'Nearby penetration cluster',
    explanation:
      'Many recent penetrations land within a small radius, which may weaken the local fabric.',
    remedies: [
      guidance(
        'penetration.near-hole-cluster',
        'Spread the penetrations',
        'Spread nearby penetrations or reduce repeated passes through this area.',
      ),
    ],
    documentationId: 'physics.penetration.near-hole-cluster',
  },
  {
    code: 'stitch.long-sewn-float',
    category: 'stitch',
    defaultSeverity: 'warning',
    evidence: 'machine-profile',
    geometryRole: 'travel',
    title: 'Long sewn span',
    explanation:
      'A sewn stitch exceeds the preferred unsupported span of the selected machine profile.',
    remedies: [
      guidance(
        'stitch.long-sewn-float',
        'Subdivide the span',
        'Shorten or subdivide this sewn span to reduce snag risk.',
      ),
    ],
    documentationId: 'physics.stitch.long-sewn-float',
  },
  {
    code: 'travel.long-untrimmed-jump',
    category: 'travel',
    defaultSeverity: 'warning',
    evidence: 'machine-profile',
    geometryRole: 'travel',
    title: 'Long untrimmed jump',
    explanation:
      'A connected jump chain exceeds the preferred travel length of the selected machine profile.',
    remedies: [
      guidance(
        'travel.long-untrimmed-jump',
        'Cut the connector thread',
        'Insert a trim before this travel or enable an appropriate autotrim threshold.',
      ),
    ],
    documentationId: 'physics.travel.long-untrimmed-jump',
  },
  {
    code: 'machine.continuous-stitch-run',
    category: 'machine',
    defaultSeverity: 'info',
    evidence: 'machine-profile',
    geometryRole: 'travel',
    title: 'Long continuous stitch run',
    explanation:
      'The design exceeds the selected profile’s preferred number of consecutive stitches without an operational boundary.',
    remedies: [
      context(
        'machine.continuous-stitch-run',
        'Plan an inspection boundary',
        'Add a planned thread boundary if the target machine needs a pause or inspection point.',
      ),
    ],
    documentationId: 'physics.machine.continuous-stitch-run',
  },
  {
    code: 'path.direction-change-cluster',
    category: 'path',
    defaultSeverity: 'warning',
    evidence: 'heuristic',
    geometryRole: 'hotspot',
    title: 'Cluster of sharp direction changes',
    explanation:
      'Several short segments turn sharply within a small area, concentrating needle perforations.',
    remedies: [
      guidance(
        'path.direction-change-cluster',
        'Open the corners',
        'Open the corner spacing or simplify the path to avoid perforating the fabric.',
      ),
    ],
    documentationId: 'physics.path.direction-change-cluster',
  },
  {
    code: 'construction.underlay-outside-topping',
    category: 'underlay',
    defaultSeverity: 'warning',
    evidence: 'engine-derived',
    geometryRole: 'envelope',
    title: 'Underlay outside topping',
    explanation:
      'Underlay penetrations protrude beyond the explicit topping envelope and may remain visible.',
    remedies: [
      guidance(
        'construction.underlay-outside-topping',
        'Contain the underlay',
        'Increase the underlay inset or widen the topping envelope.',
      ),
    ],
    documentationId: 'physics.construction.underlay-outside-topping',
  },
  {
    code: 'fill.border-overlap-too-small',
    category: 'fill',
    defaultSeverity: 'warning',
    evidence: 'heuristic',
    geometryRole: 'overlap',
    title: 'Fill and border overlap too little',
    explanation:
      'The explicit fill and satin border have less registration overlap than the construction threshold.',
    remedies: [
      guidance(
        'fill.border-overlap-too-small',
        'Increase the registration overlap',
        'Reduce fillinset or widen/reposition the explicit satin border.',
      ),
    ],
    documentationId: 'physics.fill.border-overlap-too-small',
  },
  {
    code: 'fill.border-overlap-dense',
    category: 'fill',
    defaultSeverity: 'warning',
    evidence: 'heuristic',
    geometryRole: 'overlap',
    title: 'Dense fill and border overlap',
    explanation:
      'The fill extends too far beneath the explicit satin border, creating a dense registration zone.',
    remedies: [
      guidance(
        'fill.border-overlap-dense',
        'Narrow the registration overlap',
        'Increase fillinset to retain a smaller registration overlap beneath the border.',
      ),
    ],
    documentationId: 'physics.fill.border-overlap-dense',
  },
  {
    code: 'fill.edge-run-border-stack',
    category: 'fill',
    defaultSeverity: 'warning',
    evidence: 'engine-derived',
    geometryRole: 'overlap',
    title: 'Fill edge run stacked under border',
    explanation:
      'A fill edge run occupies the same area as an explicit satin border, adding a redundant foundation pass.',
    remedies: [
      guidance(
        'fill.edge-run-border-stack',
        'Remove the redundant stack',
        'Increase filledgerun inset or omit the redundant edge run.',
      ),
    ],
    documentationId: 'physics.fill.edge-run-border-stack',
  },
  {
    code: 'satin.split-overlap-hotspot',
    category: 'satin',
    defaultSeverity: 'warning',
    evidence: 'heuristic',
    geometryRole: 'overlap',
    title: 'Split satin overlap hotspot',
    explanation:
      'Adjacent lanes in a split satin column place several penetrations within a small overlap area.',
    remedies: [
      guidance(
        'satin.split-overlap-hotspot',
        'Reduce the lane overlap',
        'Reduce satinsplitoverlap or simplify the column near this hotspot.',
      ),
    ],
    documentationId: 'physics.satin.split-overlap-hotspot',
  },
  {
    code: 'fill.connector-outside-region',
    category: 'fill',
    defaultSeverity: 'warning',
    evidence: 'engine-derived',
    geometryRole: 'travel',
    title: 'Sewn fill connector outside region',
    explanation:
      'A connector is sewn outside the fill’s explicit construction region and may remain visible.',
    remedies: [
      guidance(
        'fill.connector-outside-region',
        'Keep the connector inside or cut it',
        "Use fillconnect 'inside' or a jump/trim connector policy.",
      ),
    ],
    documentationId: 'physics.fill.connector-outside-region',
  },
  {
    code: 'fill.stagger-short-fragment',
    category: 'fill',
    defaultSeverity: 'warning',
    evidence: 'engine-derived',
    geometryRole: 'hotspot',
    title: 'Fill stagger created a short fragment',
    explanation:
      'The selected row staggering produced an edge movement below the reliable stitch length, so the engine merged it.',
    remedies: [
      guidance(
        'fill.stagger-short-fragment',
        'Adjust the row phase',
        'Reduce the stagger amount or use a different stagger mode for this boundary.',
      ),
    ],
    documentationId: 'physics.fill.stagger-short-fragment',
  },
  {
    code: 'fill.short-fragment-omitted',
    category: 'fill',
    defaultSeverity: 'info',
    evidence: 'engine-derived',
    geometryRole: 'hotspot',
    title: 'Short fill fragment omitted',
    explanation:
      'A topping row fragment was shorter than the configured useful-edge threshold and was intentionally omitted.',
    remedies: [
      context(
        'fill.short-fragment-omitted',
        'Review the small edge gap',
        'Reduce filledgeshort only if the omitted fragment leaves a visible coverage gap.',
      ),
    ],
    documentationId: 'physics.fill.short-fragment-omitted',
  },
  {
    code: 'fill.compensation-outside-boundary',
    category: 'fill',
    defaultSeverity: 'warning',
    evidence: 'engine-derived',
    geometryRole: 'boundary',
    title: 'Compensated fill crosses its boundary',
    explanation:
      'Directional endpoint compensation extends a fill row beyond the authored construction boundary.',
    remedies: [
      guidance(
        'fill.compensation-outside-boundary',
        'Reserve registration space',
        'Increase fillinset, reduce pull compensation, or add an overlapping border.',
      ),
    ],
    documentationId: 'physics.fill.compensation-outside-boundary',
  },
  {
    code: 'fill.edge-run-collapse',
    category: 'fill',
    defaultSeverity: 'warning',
    evidence: 'engine-derived',
    geometryRole: 'boundary',
    title: 'Fill edge run collapsed',
    explanation:
      'The requested inward edge-run offset has no usable contour in this part of the fill.',
    remedies: [
      guidance(
        'fill.edge-run-collapse',
        'Reduce the edge-run inset',
        'Reduce filledgerun or omit it for this narrow construction.',
      ),
    ],
    documentationId: 'physics.fill.edge-run-collapse',
  },
  {
    code: 'fill.edge-run-penetration-guard',
    category: 'penetration',
    defaultSeverity: 'info',
    evidence: 'engine-derived',
    geometryRole: 'penetration-cluster',
    title: 'Fill edge-run penetrations bounded',
    explanation:
      'The engine omitted repeated edge-run visits at an acute or collapsed corner to avoid concentrating penetrations.',
    remedies: [
      context(
        'fill.edge-run-penetration-guard',
        'Review the corner shape',
        'Open the acute corner or reduce the edge-run inset if the guarded result is visibly uneven.',
      ),
    ],
    documentationId: 'physics.fill.edge-run-penetration-guard',
  },
  {
    code: 'fill.edge-run-dense-overlap',
    category: 'fill',
    defaultSeverity: 'warning',
    evidence: 'engine-derived',
    geometryRole: 'overlap',
    title: 'Fill edge run overlaps dense coverage',
    explanation:
      'The optional fill edge run occupies an area that already has dense border coverage.',
    remedies: [
      guidance(
        'fill.edge-run-dense-overlap',
        'Remove the redundant coverage',
        'Increase the edge-run inset or omit the edge run beneath the border.',
      ),
    ],
    documentationId: 'physics.fill.edge-run-dense-overlap',
  },
  {
    code: 'fill.inset-region-change',
    category: 'fill',
    defaultSeverity: 'warning',
    evidence: 'engine-derived',
    geometryRole: 'boundary',
    title: 'Fill inset changed region topology',
    explanation:
      'The requested fill inset emptied, split, or collapsed part of the authored compound region.',
    remedies: [
      guidance(
        'fill.inset-region-change',
        'Reduce the fill inset',
        'Reduce fillinset or widen the narrow part of the authored boundary.',
      ),
    ],
    documentationId: 'physics.fill.inset-region-change',
  },
  {
    code: 'construction.layer-order',
    category: 'underlay',
    defaultSeverity: 'error',
    evidence: 'engine-derived',
    geometryRole: 'overlap',
    title: 'Construction layer order reversed',
    explanation:
      'Final sew order places decorative topping before its required foundation underlay.',
    remedies: [
      guidance(
        'construction.layer-order',
        'Preserve foundation order',
        'Keep foundation and decorative passes in one atomic planning span.',
      ),
    ],
    documentationId: 'physics.construction.layer-order',
  },
] as const satisfies readonly PhysicsDiagnosticCatalogEntry[]);

export type PhysicsDiagnosticCode = (typeof PHYSICS_DIAGNOSTIC_CATALOG)[number]['code'];

const CATALOG_BY_CODE = new Map<string, PhysicsDiagnosticCatalogEntry>(
  PHYSICS_DIAGNOSTIC_CATALOG.map((entry) => [entry.code, entry]),
);

const ENTRY_KEYS = new Set([
  'code',
  'category',
  'defaultSeverity',
  'evidence',
  'geometryRole',
  'title',
  'explanation',
  'remedies',
  'documentationId',
]);
const REMEDY_KEYS = new Set(['id', 'title', 'description', 'kind', 'documentationId']);

function requireText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`Physics diagnostic catalog ${label} must not be empty.`);
}

/** Fail fast on catalog identity, documentation, guidance, or presentation-data drift. */
export function validatePhysicsDiagnosticCatalog(
  entries: readonly PhysicsDiagnosticCatalogEntry[] = PHYSICS_DIAGNOSTIC_CATALOG,
): void {
  const codes = new Set<string>();
  const remedyIds = new Set<string>();
  for (const entry of entries) {
    for (const key of Object.keys(entry))
      if (!ENTRY_KEYS.has(key))
        throw new Error(
          `Physics diagnostic catalog entry ${entry.code || '<unknown>'} contains unsupported metadata '${key}'.`,
        );
    requireText(entry.code, 'code');
    if (codes.has(entry.code))
      throw new Error(`Physics diagnostic catalog contains duplicate code '${entry.code}'.`);
    codes.add(entry.code);
    requireText(entry.title, `${entry.code} title`);
    requireText(entry.explanation, `${entry.code} explanation`);
    requireText(entry.documentationId, `${entry.code} documentationId`);
    if (!entry.remedies.length)
      throw new Error(`Physics diagnostic catalog ${entry.code} must provide at least one remedy.`);
    for (const remedy of entry.remedies) {
      for (const key of Object.keys(remedy))
        if (!REMEDY_KEYS.has(key))
          throw new Error(
            `Physics diagnostic catalog remedy ${remedy.id || '<unknown>'} contains unsupported metadata '${key}'.`,
          );
      requireText(remedy.id, `${entry.code} remedy id`);
      requireText(remedy.title, `${entry.code} remedy title`);
      requireText(remedy.description, `${entry.code} remedy description`);
      if (remedyIds.has(remedy.id))
        throw new Error(`Physics diagnostic catalog contains duplicate remedy id '${remedy.id}'.`);
      remedyIds.add(remedy.id);
    }
  }
}

export function getPhysicsDiagnosticCatalogEntry(code: string): PhysicsDiagnosticCatalogEntry {
  const entry = CATALOG_BY_CODE.get(code);
  if (!entry) throw new Error(`Unknown physics diagnostic code '${code}'.`);
  return entry;
}

/** Static compatibility fields retained on PreflightIssue. */
export function preflightCatalogMetadata(
  code: PhysicsDiagnosticCode,
): Pick<import('../../core/types.ts').PreflightIssue, 'severity' | 'suggestion'> {
  const entry = getPhysicsDiagnosticCatalogEntry(code);
  return {
    severity: entry.defaultSeverity,
    suggestion: entry.remedies[0].description,
  };
}
