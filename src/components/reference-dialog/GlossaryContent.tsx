import { useMemo } from 'react';
import styles from '../ReferenceDialog.module.css';

interface GlossaryTerm {
  term: string;
  definition: string;
  commands: readonly string[];
  keywords?: string;
}

interface GlossarySection {
  title: string;
  intro: string;
  terms: GlossaryTerm[];
}

const GLOSSARY: GlossarySection[] = [
  {
    title: 'Stitches & thread',
    intro: 'The physical marks and thread paths that make up an embroidery design.',
    terms: [
      {
        term: 'Needle penetration',
        definition: 'A point where the needle passes through the fabric.',
        commands: ['stitchedpoints', 'countat', 'nearestsewn'],
      },
      {
        term: 'Stitch',
        definition: 'The thread laid between two consecutive needle penetrations.',
        commands: ['fd', 'sewpath'],
      },
      {
        term: 'Stitch length',
        definition:
          'The distance between consecutive penetrations along a sewn path; set with stitchlen or filllen.',
        commands: ['stitchlen', 'filllen'],
        keywords: 'stitchlen stitchlength filllen',
      },
      {
        term: 'Running stitch',
        definition: 'An evenly spaced line of stitches; NeedleScript’s default stitch mode.',
        commands: ['stitchlen', 'fd', 'sewrun'],
      },
      {
        term: 'Bean stitch',
        definition: 'A running stitch sewn repeatedly over itself to make a bolder line.',
        commands: ['bean', 'beanoutline'],
        keywords: 'bean',
      },
      {
        term: 'Blanket / E-stitch',
        definition: 'An edge stitch with short prongs extending from one side of its travel path.',
        commands: ['estitch'],
        keywords: 'estitch',
      },
      {
        term: 'Jump / travel',
        definition: 'A needle-up move that repositions the machine without sewing.',
        commands: ['up', 'jump', 'moveto', 'autotrim'],
        keywords: 'jump moveto travel',
      },
      {
        term: 'Connector',
        definition:
          'Thread joining two sewn fragments. It may be stitched inside a region or replaced by a jump or trim.',
        commands: ['fillconnect', 'trim', 'autotrim'],
        keywords: 'fillconnect inside jump trim',
      },
      {
        term: 'Float',
        definition:
          'A long span of thread carried between penetrations; excessive floats can snag or show through.',
        commands: ['trim', 'autotrim', 'preflight'],
      },
      {
        term: 'Trim',
        definition: 'A thread cut that prevents a loose connector between separate regions.',
        commands: ['trim', 'autotrim'],
        keywords: 'trim autotrim',
      },
      {
        term: 'Tie-in / tie-off',
        definition: 'Small anchoring stitches applied at a thread start or end.',
        commands: ['lock'],
        keywords: 'lock',
      },
      {
        term: 'Thread run',
        definition:
          'A contiguous sequence of stitches that the planner can treat as one sew-order item.',
        commands: ['atomic', 'routegroup', 'plan'],
        keywords: 'plan atomic routegroup',
      },
      {
        term: 'Color block',
        definition:
          'A consecutive part of a design sewn with one thread color, bounded by color changes.',
        commands: ['color', 'palette', 'stop'],
      },
    ],
  },
  {
    title: 'Satin construction',
    intro: 'How narrow, glossy columns are shaped and kept machine-safe.',
    terms: [
      {
        term: 'Satin column',
        definition:
          'A dense zigzag that crosses a narrow center path, often used for borders and lettering.',
        commands: ['satin', 'satinbetween', 'satinalong'],
        keywords: 'satin satinbetween',
      },
      {
        term: 'Spine',
        definition: 'The center path along which a satin column travels.',
        commands: ['satin', 'railspine'],
        keywords: 'railspine satin',
      },
      {
        term: 'Rails',
        definition: 'The two edge paths joined by the stitches of a rail-pair satin column.',
        commands: ['satinbetween', 'satinpair'],
        keywords: 'satinbetween rail pair',
      },
      {
        term: 'Satin bite / chord',
        definition: 'One zigzag stitch spanning from one side of a satin column to the other.',
        commands: ['satin', 'density'],
      },
      {
        term: 'Satin cap',
        definition:
          'The construction at an open column end: butt, taper, point, or round; selected with satincap.',
        commands: ['satincap', 'satincaplen'],
        keywords: 'satincap satincaplen butt taper point round',
      },
      {
        term: 'Satin join',
        definition:
          'The construction used where a column turns sharply: continuous, fan, miter, or split; selected with satinjoin.',
        commands: ['satinjoin', 'satincorner'],
        keywords: 'satinjoin satincorner continuous fan miter split corner',
      },
      {
        term: 'Wide-column splitting',
        definition:
          'Dividing an unsafe wide satin into adjacent, narrower subcolumns while preserving its appearance.',
        commands: ['satinwide', 'satinmaxwidth'],
        keywords: 'satinwide satinmaxwidth',
      },
      {
        term: 'Split overlap',
        definition:
          'A narrow interlocking band shared by neighboring split satin subcolumns to prevent a fabric gap.',
        commands: ['satinsplitoverlap'],
        keywords: 'satinsplitoverlap shared seam',
      },
      {
        term: 'Snag risk',
        definition:
          'The chance that a long exposed satin stitch catches or loosens; wide columns are especially vulnerable.',
        commands: ['satinmaxwidth', 'preflight'],
      },
    ],
  },
  {
    title: 'Underlay',
    intro: 'Hidden foundation stitching that supports the visible design.',
    terms: [
      {
        term: 'Underlay',
        definition:
          'Stabilizing stitches sewn beneath visible satin or fill stitching to secure fabric and control distortion.',
        commands: ['underlay', 'fillunderlay'],
        keywords: 'underlay fillunderlay',
      },
      {
        term: 'Underlay pass / profile',
        definition:
          'One foundation layer, or an ordered recipe of layers, with its own length, inset, spacing, and angle.',
        commands: ['underlaypasses', 'fillunderlaypasses'],
        keywords: 'underlaypasses underlaylen fillunderlaypasses fillunderlaylen profile',
      },
      {
        term: 'Center-run underlay',
        definition: 'Running stitches placed along the spine of a satin column.',
        commands: ['underlay', 'underlaypasses'],
        keywords: 'underlay center',
      },
      {
        term: 'Edge-walk underlay',
        definition: 'Running stitches inset from the edges of a satin column or fill boundary.',
        commands: ['underlay', 'fillunderlay', 'railinset'],
        keywords: 'underlay edge fillunderlay inset',
      },
      {
        term: 'Zigzag underlay',
        definition: 'A loose zigzag foundation beneath a satin column.',
        commands: ['underlay', 'underlayspacing'],
        keywords: 'underlay zigzag underlayspacing',
      },
      {
        term: 'Tatami underlay',
        definition:
          'A sparse fill foundation, usually angled across the visible fill to support it from another direction.',
        commands: ['fillunderlay', 'fillunderlayangle', 'fillunderlayspacing'],
        keywords: 'fillunderlay tatami fillunderlayangle fillunderlayspacing',
      },
      {
        term: 'Inset',
        definition:
          'A physical distance that moves construction inward from an edge; it can reserve space or keep underlay hidden.',
        commands: ['underlayinset', 'fillunderlayinset', 'fillinset', 'filledgerun'],
        keywords: 'underlayinset fillunderlayinset fillinset filledgerun',
      },
      {
        term: 'Pass order',
        definition:
          'The authored sequence of foundation and visible layers; all underlay should sew before its topping layer.',
        commands: ['underlaypasses', 'fillunderlaypasses', 'preflight'],
        keywords: 'layer order preflight underlaypasses',
      },
    ],
  },
  {
    title: 'Fills & coverage',
    intro: 'How regions are covered while controlling texture, routing, and fabric stress.',
    terms: [
      {
        term: 'Tatami fill',
        definition: 'Parallel rows of running stitches that cover a region.',
        commands: ['beginfill', 'endfill', 'fillrows'],
      },
      {
        term: 'Topping layer',
        definition:
          'The visible satin or fill stitches sewn after underlay; this is not the removable fabric topping material.',
        commands: ['satin', 'beginfill', 'endfill'],
        keywords: 'top stitching top-stitch',
      },
      {
        term: 'Fill angle',
        definition: 'The direction of fill rows; changing it alters texture and reflected light.',
        commands: ['fillangle'],
        keywords: 'fillangle',
      },
      {
        term: 'Row spacing / pitch',
        definition:
          'The distance between neighboring fill rows. Smaller spacing produces denser coverage.',
        commands: ['fillspacing'],
        keywords: 'fillspacing pitch',
      },
      {
        term: 'Stagger / row phase',
        definition:
          'The offset of penetrations from one fill row to the next, used to avoid visible grooves and repeated holes.',
        commands: ['fillstagger', 'fillstaggeramount'],
        keywords: 'fillstagger fillstaggeramount brick progressive random',
      },
      {
        term: 'Fill connector policy',
        definition:
          'The rule for moving between fill fragments: sew only contained connectors, jump, trim, or use legacy routing.',
        commands: ['fillconnect', 'jump', 'trim'],
        keywords: 'fillconnect legacy inside jump trim containment',
      },
      {
        term: 'Fill inset',
        definition:
          'An inward offset of the whole fill region, commonly used to reserve overlap beneath a border.',
        commands: ['fillinset', 'fillbordergeometry'],
        keywords: 'fillinset fill border overlap',
      },
      {
        term: 'Edge run',
        definition:
          'An inset boundary pass sewn between fill underlay and visible fill to reinforce or define the edge.',
        commands: ['filledgerun'],
        keywords: 'filledgerun',
      },
      {
        term: 'Short-fragment filtering',
        definition:
          'Omitting fill-row fragments too short to sew usefully, without changing underlay or closed contours.',
        commands: ['filledgeshort'],
        keywords: 'filledgeshort short edge shortening',
      },
      {
        term: 'Directional fill',
        definition: 'A fill whose rows follow a heading field instead of one fixed angle.',
        commands: ['fill', 'beginfill', 'endfill'],
        keywords: 'fill dir field programmable fill',
      },
      {
        term: 'Serpentine routing',
        definition:
          'Ordering neighboring fill rows in alternating directions to reduce travel between their ends.',
        commands: ['serpentinerows', 'routesort'],
        keywords: 'serpentinerows reverse rows',
      },
      {
        term: 'Coverage',
        definition:
          'The estimated number of thread layers over an area, using the active physical thread width.',
        commands: ['coverat', 'threadwidth', 'maxdensity'],
        keywords: 'coverat threadwidth heatmap maxdensity',
      },
      {
        term: 'Stitch density',
        definition:
          'How closely stitches or rows are packed. More density means less spacing and more fabric stress.',
        commands: ['density', 'fillspacing', 'maxdensity'],
        keywords: 'density fillspacing maxdensity',
      },
      {
        term: 'Density-neutral gradient',
        definition:
          'A multicolor blend where each candidate row belongs to exactly one color, keeping total row density constant.',
        commands: ['gradientrows', 'gradientrowsn'],
        keywords: 'gradientrows gradientrowsn gradient fill error diffusion',
      },
      {
        term: 'Error diffusion',
        definition:
          'A deterministic way to distribute gradient rows among colors while carrying rounding error forward.',
        commands: ['gradientrows', 'gradientrowsn'],
        keywords: 'gradientrows gradientrowsn',
      },
      {
        term: 'Knockdown',
        definition:
          'A sparse foundation that flattens fleece, terry, or pile before the visible design is sewn.',
        commands: ['knockdown'],
        keywords: 'knockdown',
      },
      {
        term: 'Bordered fill',
        definition:
          'A filled region finished with a satin or running-stitch border that overlaps the fill edge.',
        commands: ['fillbordergeometry', 'fillandborder', 'fillandborderwith'],
        keywords: 'fillandborder fillandborderwith fillbordergeometry',
      },
    ],
  },
  {
    title: 'Fabric & finishing',
    intro: 'Material choices and compensation that help a design sew cleanly.',
    terms: [
      {
        term: 'Fabric grain',
        definition:
          'The main direction of the fabric structure, recorded as a heading so compensation can respond to it.',
        commands: ['fabricgrain', 'compensation'],
        keywords: 'fabricgrain grain heading',
      },
      {
        term: 'Along / across stretch',
        definition: 'Separate stretch amounts parallel and perpendicular to the fabric grain.',
        commands: ['fabricstretch', 'compensation'],
        keywords: 'fabricstretch directional anisotropic',
      },
      {
        term: 'Pull compensation',
        definition:
          'Extra width or length added to counter thread tension pulling a stitched shape inward.',
        commands: ['pullcomp', 'compensation'],
        keywords: 'pullcomp compensation',
      },
      {
        term: 'Directional compensation',
        definition:
          'Pull compensation projected from fabric grain and stretch onto the physical direction of satin or fill stitches.',
        commands: ['compensation', 'fabricgrain', 'fabricstretch', 'pullcomp'],
        keywords: 'compensation directional fabricgrain fabricstretch',
      },
      {
        term: 'Push compensation',
        definition:
          'A correction for stitched shapes lengthening along the direction of sewing; NeedleScript records it in the physics model but does not yet apply it.',
        commands: ['fabric', 'fabricgrain', 'fabricstretch'],
        keywords: 'push fabric physics',
      },
      {
        term: 'Thread profile / weight',
        definition:
          'A named thread material and size, such as polyester 40 wt; a larger weight number denotes a finer thread.',
        commands: ['threadprofile'],
        keywords: 'threadprofile rayon polyester 40wt 60wt',
      },
      {
        term: 'Thread width',
        definition:
          'The approximate physical width of the laid thread, used to estimate coverage rather than to change stitch geometry.',
        commands: ['threadwidth', 'coverat'],
        keywords: 'threadwidth',
      },
      {
        term: 'Needle size',
        definition:
          'The metric needle diameter category; for example, size 75 means about 0.75 mm at the blade.',
        commands: ['needle'],
        keywords: 'needle nm',
      },
      {
        term: 'Stabilizer',
        definition:
          'Supporting material beneath the fabric, such as cutaway, tearaway, or washaway, that resists distortion.',
        commands: ['stabilizer', 'fabric'],
        keywords: 'stabilizer cutaway tearaway washaway',
      },
      {
        term: 'Fabric topping',
        definition:
          'A removable material placed above fleece or pile so stitches do not sink in; distinct from the visible topping layer.',
        commands: ['topping', 'fabric', 'knockdown'],
        keywords: 'topping water soluble pile fleece',
      },
      {
        term: 'Puckering',
        definition: 'Fabric wrinkling caused by tension, inadequate support, or excessive density.',
        commands: ['fabric', 'stabilizer', 'fillspacing', 'maxdensity', 'preflight'],
      },
      {
        term: 'Sew-out',
        definition:
          'A physical test stitched on the intended fabric, thread, stabilizer, and machine.',
        commands: ['fabric', 'threadprofile', 'needle', 'stabilizer', 'preflight'],
        keywords: 'validation sample',
      },
    ],
  },
  {
    title: 'Appliqué',
    intro: 'Layered construction that attaches a separate piece of fabric.',
    terms: [
      {
        term: 'Appliqué',
        definition:
          'A technique that places and secures a cut fabric shape as part of the embroidered design.',
        commands: ['appliquewith', 'appliquesteps'],
        keywords: 'applique appliquewith appliquesteps',
      },
      {
        term: 'Placement line',
        definition: 'A first outline showing where the appliqué fabric should be positioned.',
        commands: ['appliquewith', 'appliquesteps'],
        keywords: 'placement',
      },
      {
        term: 'Tackdown',
        definition: 'A second outline that holds the appliqué fabric in place before finishing.',
        commands: ['appliquewith', 'appliquesteps'],
        keywords: 'tackdown inset',
      },
      {
        term: 'Cover stitch',
        definition:
          'The finishing border, commonly satin, that covers the cut edge of appliqué fabric.',
        commands: ['satin', 'appliquewith', 'appliquesteps'],
        keywords: 'cover width',
      },
      {
        term: 'Stop',
        definition:
          'A machine pause used for actions such as placing or trimming appliqué fabric or changing thread.',
        commands: ['stop', 'color'],
        keywords: 'stop color change',
      },
    ],
  },
  {
    title: 'Sew order & preflight',
    intro: 'How NeedleScript organizes travel and checks whether a design is practical to stitch.',
    terms: [
      {
        term: 'Sew order',
        definition:
          'The sequence in which constructions are stitched; it affects travel, stability, and layer relationships.',
        commands: ['plan', 'planbarrier', 'atomic', 'routegroup'],
        keywords: 'plan planning',
      },
      {
        term: 'Travel planning',
        definition:
          'Reordering eligible thread runs to shorten jumps while preserving colors and construction constraints.',
        commands: ['plan', 'routesort'],
        keywords: 'plan nearest reversing-nearest',
      },
      {
        term: 'Route group',
        definition: 'An explicit collection of independent runs that the planner may reorder.',
        commands: ['routegroup', 'plan'],
        keywords: 'routegroup',
      },
      {
        term: 'Atomic construction',
        definition:
          'A complete item whose internal stitches stay together and in order even if the planner moves the whole item.',
        commands: ['atomic', 'plan'],
        keywords: 'atomic',
      },
      {
        term: 'Plan barrier',
        definition: 'A fixed authored boundary that travel planning may not move runs across.',
        commands: ['planbarrier', 'plan'],
        keywords: 'planbarrier',
      },
      {
        term: 'Run reversal',
        definition:
          'Sewing a safe thread run from its opposite end to shorten travel without changing its stitched geometry.',
        commands: ['plan', 'routesort'],
        keywords: 'reversing-nearest plan',
      },
      {
        term: 'Preflight',
        definition:
          'A deterministic post-run check for sewability issues such as density, long floats, hoop overflow, and layer order.',
        commands: ['preflight', 'maxdensity', 'hoop'],
        keywords: 'preflight warn strict issue diagnostic',
      },
      {
        term: 'Machine profile',
        definition:
          'Local machine limits and calibration data applied at run time rather than stored in a portable design.',
        commands: ['hoop', 'override', 'preflight'],
        keywords: 'RunOptions calibration correction',
      },
      {
        term: 'Calibration',
        definition:
          'Measurements from a known test pattern used to correct a particular machine’s scale, skew, or reach.',
        commands: ['override', 'hoop'],
        keywords: 'machine profile',
      },
    ],
  },
  {
    title: 'Coordinates & turtle',
    intro: 'NeedleScript inherits Logo’s moving-turtle model.',
    terms: [
      {
        term: 'Turtle',
        definition: 'The virtual needle carrier with a position, heading, and pen state.',
        commands: ['pos', 'heading', 'fd', 'up', 'down'],
      },
      {
        term: 'Heading',
        definition: 'A compass-like degree angle: 0 is north and positive angles turn clockwise.',
        commands: ['heading', 'seth', 'rt', 'lt'],
      },
      {
        term: 'Local / design space',
        definition: 'Coordinates before the active transforms map geometry into the physical hoop.',
        commands: ['pos', 'setpos', 'trace'],
        keywords: 'local frame design space',
      },
      {
        term: 'Hoop space',
        definition:
          'Final physical coordinates, measured in millimeters, where stitches, compensation, coverage, and machine limits apply.',
        commands: ['stitchedpoints', 'coverat', 'infield', 'fieldpath'],
      },
      {
        term: 'Hoop',
        definition: 'The frame that holds fabric taut and defines the intended sewable field.',
        commands: ['hoop', 'infield', 'fieldbounds', 'fieldpath'],
      },
      {
        term: 'Transform',
        definition:
          'A mapping such as translate, rotate, scale, mirror, or skew, applied before physical stitch rules.',
        commands: ['translate', 'rotate', 'scale', 'mirror', 'skew', 'transform'],
        keywords: 'affine transform',
      },
    ],
  },
  {
    title: 'Geometry & regions',
    intro: 'Data-space tools for building, clipping, and reusing motifs.',
    terms: [
      {
        term: 'Path / region',
        definition:
          'A path is an ordered list of points; a region is a closed area bounded by one or more paths.',
        commands: ['trace', 'tracerings', 'sewpath', 'fill'],
      },
      {
        term: 'Compound region',
        definition: 'A region with multiple rings, allowing holes or separate filled components.',
        commands: ['tracerings', 'clippaths', 'fillrows'],
        keywords: 'rings components fill region',
      },
      {
        term: 'Even-odd rule',
        definition:
          'A point is inside when a ray crosses an odd number of boundary rings, so nested inner rings form holes.',
        commands: ['tracerings', 'inpath', 'fillrows'],
      },
      {
        term: 'Containment',
        definition:
          'The requirement that a stitch, connector, or offset stays inside its construction region and outside holes.',
        commands: ['inpath', 'clippaths', 'fillconnect'],
        keywords: 'inside fillconnect declump',
      },
      {
        term: 'Resampling',
        definition: 'Redistributing path points at controlled spacing for clean stitching.',
        commands: ['resample', 'stitchlen'],
      },
      {
        term: 'Warp',
        definition: 'A custom per-point deformation applied before stitch splitting.',
        commands: ['warp', 'warppath'],
      },
      {
        term: 'Trace',
        definition: 'A sandboxed drawing block that captures a path as data without sewing.',
        commands: ['trace', 'tracerings'],
      },
    ],
  },
  {
    title: 'Generative design',
    intro: 'Deterministic variation makes organic results editable and repeatable.',
    terms: [
      {
        term: 'Deterministic',
        definition:
          'Producing the same stitches, warnings, and random choices from the same program, seed, and run settings.',
        commands: ['seed', 'random'],
      },
      {
        term: 'Seed',
        definition: 'The number that determines all seeded random output in a program.',
        commands: ['seed', 'random'],
      },
      {
        term: 'Scoped construction settings',
        definition:
          'Temporary stitch settings restored when a stitchscope block exits; movement, color, and output are not restored.',
        commands: ['stitchscope'],
        keywords: 'stitchscope snapshot restore sticky settings',
      },
      {
        term: 'Simplex noise',
        definition: 'Smooth seeded variation for organic fields and coherent drift.',
        commands: ['snoise2', 'snoise3', 'fbm2'],
      },
      {
        term: 'Poisson-disc sampling',
        definition: 'Random-looking points kept a minimum distance apart.',
        commands: ['scatter'],
      },
      {
        term: 'Voronoi diagram',
        definition: 'A division of space into one nearest-point cell per input point.',
        commands: ['voronoi'],
      },
      {
        term: 'Lloyd’s relaxation',
        definition: 'Repeatedly moving points to cell centroids for more even spacing.',
        commands: ['relax'],
      },
    ],
  },
];

const LEAD =
  'NeedleScript joins machine embroidery and generative programming. The language reference is the source of truth for command behavior; this glossary explains the craft, construction, material, planning, and geometry vocabulary behind it.';

function filterGlossary(query: string): GlossarySection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const sections: GlossarySection[] = [];
  for (const section of GLOSSARY) {
    const terms = section.terms.filter(
      (term) =>
        !normalizedQuery ||
        term.term.toLowerCase().includes(normalizedQuery) ||
        term.definition.toLowerCase().includes(normalizedQuery) ||
        term.commands.some((command) => command.toLowerCase().includes(normalizedQuery)) ||
        term.keywords?.toLowerCase().includes(normalizedQuery),
    );
    if (terms.length > 0) sections.push({ ...section, terms });
  }
  return sections;
}

interface GlossaryContentProps {
  query: string;
}

export function GlossaryContent({ query }: GlossaryContentProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const sections = useMemo(() => filterGlossary(normalizedQuery), [normalizedQuery]);

  if (sections.length === 0) {
    return <div className={styles.empty}>no matches for &ldquo;{query}&rdquo;</div>;
  }

  return (
    <div className="pb-4">
      {!normalizedQuery && <p className={styles.glossLead}>{LEAD}</p>}
      {sections.map((section) => (
        <section key={section.title} className={styles.section}>
          <h3 className={styles.sectionTitle}>{section.title}</h3>
          {!normalizedQuery && <p className={styles.sectionNote}>{section.intro}</p>}
          <div className={styles.glossTerms}>
            {section.terms.map((term) => (
              <div key={term.term} className={styles.glossEntry} data-glossary-entry>
                <span className={styles.term}>{term.term}</span>
                <span className={styles.desc}>{term.definition}</span>
                <span className={styles.glossCommands}>
                  <span className={styles.glossCommandsLabel}>Related commands:</span>
                  {term.commands.map((command) => (
                    <code key={command} className={styles.inlineCode} data-glossary-command>
                      {command}
                    </code>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
