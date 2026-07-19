import { useMemo } from 'react';
import styles from '../ReferenceDialog.module.css';

interface GlossaryTerm {
  term: string;
  definition: string;
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
      },
      {
        term: 'Stitch',
        definition: 'The thread laid between two consecutive needle penetrations.',
      },
      {
        term: 'Stitch length',
        definition:
          'The distance between consecutive penetrations along a sewn path; set with stitchlen or filllen.',
        keywords: 'stitchlen stitchlength filllen',
      },
      {
        term: 'Running stitch',
        definition: 'An evenly spaced line of stitches; NeedleScript’s default stitch mode.',
      },
      {
        term: 'Bean stitch',
        definition: 'A running stitch sewn repeatedly over itself to make a bolder line.',
        keywords: 'bean',
      },
      {
        term: 'Blanket / E-stitch',
        definition: 'An edge stitch with short prongs extending from one side of its travel path.',
        keywords: 'estitch',
      },
      {
        term: 'Jump / travel',
        definition: 'A needle-up move that repositions the machine without sewing.',
        keywords: 'jump moveto travel',
      },
      {
        term: 'Connector',
        definition:
          'Thread joining two sewn fragments. It may be stitched inside a region or replaced by a jump or trim.',
        keywords: 'fillconnect inside jump trim',
      },
      {
        term: 'Float',
        definition:
          'A long span of thread carried between penetrations; excessive floats can snag or show through.',
      },
      {
        term: 'Trim',
        definition: 'A thread cut that prevents a loose connector between separate regions.',
        keywords: 'trim autotrim',
      },
      {
        term: 'Tie-in / tie-off',
        definition: 'Small anchoring stitches applied at a thread start or end.',
        keywords: 'lock',
      },
      {
        term: 'Thread run',
        definition:
          'A contiguous sequence of stitches that the planner can treat as one sew-order item.',
        keywords: 'plan atomic routegroup',
      },
      {
        term: 'Color block',
        definition:
          'A consecutive part of a design sewn with one thread color, bounded by color changes.',
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
        keywords: 'satin satinbetween',
      },
      {
        term: 'Spine',
        definition: 'The center path along which a satin column travels.',
        keywords: 'railspine satin',
      },
      {
        term: 'Rails',
        definition: 'The two edge paths joined by the stitches of a rail-pair satin column.',
        keywords: 'satinbetween rail pair',
      },
      {
        term: 'Satin bite / chord',
        definition: 'One zigzag stitch spanning from one side of a satin column to the other.',
      },
      {
        term: 'Satin cap',
        definition:
          'The construction at an open column end: butt, taper, point, or round; selected with satincap.',
        keywords: 'satincap satincaplen butt taper point round',
      },
      {
        term: 'Satin join',
        definition:
          'The construction used where a column turns sharply: continuous, fan, miter, or split; selected with satinjoin.',
        keywords: 'satinjoin satincorner continuous fan miter split corner',
      },
      {
        term: 'Wide-column splitting',
        definition:
          'Dividing an unsafe wide satin into adjacent, narrower subcolumns while preserving its appearance.',
        keywords: 'satinwide satinmaxwidth',
      },
      {
        term: 'Split overlap',
        definition:
          'A narrow interlocking band shared by neighboring split satin subcolumns to prevent a fabric gap.',
        keywords: 'satinsplitoverlap shared seam',
      },
      {
        term: 'Snag risk',
        definition:
          'The chance that a long exposed satin stitch catches or loosens; wide columns are especially vulnerable.',
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
        keywords: 'underlay fillunderlay',
      },
      {
        term: 'Underlay pass / profile',
        definition:
          'One foundation layer, or an ordered recipe of layers, with its own length, inset, spacing, and angle.',
        keywords: 'underlaypasses underlaylen fillunderlaypasses fillunderlaylen profile',
      },
      {
        term: 'Center-run underlay',
        definition: 'Running stitches placed along the spine of a satin column.',
        keywords: 'underlay center',
      },
      {
        term: 'Edge-walk underlay',
        definition: 'Running stitches inset from the edges of a satin column or fill boundary.',
        keywords: 'underlay edge fillunderlay inset',
      },
      {
        term: 'Zigzag underlay',
        definition: 'A loose zigzag foundation beneath a satin column.',
        keywords: 'underlay zigzag underlayspacing',
      },
      {
        term: 'Tatami underlay',
        definition:
          'A sparse fill foundation, usually angled across the visible fill to support it from another direction.',
        keywords: 'fillunderlay tatami fillunderlayangle fillunderlayspacing',
      },
      {
        term: 'Inset',
        definition:
          'A physical distance that moves construction inward from an edge; it can reserve space or keep underlay hidden.',
        keywords: 'underlayinset fillunderlayinset fillinset filledgerun',
      },
      {
        term: 'Pass order',
        definition:
          'The authored sequence of foundation and visible layers; all underlay should sew before its topping layer.',
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
      },
      {
        term: 'Topping layer',
        definition:
          'The visible satin or fill stitches sewn after underlay; this is not the removable fabric topping material.',
        keywords: 'top stitching top-stitch',
      },
      {
        term: 'Fill angle',
        definition: 'The direction of fill rows; changing it alters texture and reflected light.',
        keywords: 'fillangle',
      },
      {
        term: 'Row spacing / pitch',
        definition:
          'The distance between neighboring fill rows. Smaller spacing produces denser coverage.',
        keywords: 'fillspacing pitch',
      },
      {
        term: 'Stagger / row phase',
        definition:
          'The offset of penetrations from one fill row to the next, used to avoid visible grooves and repeated holes.',
        keywords: 'fillstagger fillstaggeramount brick progressive random',
      },
      {
        term: 'Fill connector policy',
        definition:
          'The rule for moving between fill fragments: sew only contained connectors, jump, trim, or use legacy routing.',
        keywords: 'fillconnect legacy inside jump trim containment',
      },
      {
        term: 'Fill inset',
        definition:
          'An inward offset of the whole fill region, commonly used to reserve overlap beneath a border.',
        keywords: 'fillinset fill border overlap',
      },
      {
        term: 'Edge run',
        definition:
          'An inset boundary pass sewn between fill underlay and visible fill to reinforce or define the edge.',
        keywords: 'filledgerun',
      },
      {
        term: 'Short-fragment filtering',
        definition:
          'Omitting fill-row fragments too short to sew usefully, without changing underlay or closed contours.',
        keywords: 'filledgeshort short edge shortening',
      },
      {
        term: 'Directional fill',
        definition: 'A fill whose rows follow a heading field instead of one fixed angle.',
        keywords: 'fill dir field programmable fill',
      },
      {
        term: 'Serpentine routing',
        definition:
          'Ordering neighboring fill rows in alternating directions to reduce travel between their ends.',
        keywords: 'serpentinerows reverse rows',
      },
      {
        term: 'Coverage',
        definition:
          'The estimated number of thread layers over an area, using the active physical thread width.',
        keywords: 'coverat threadwidth heatmap maxdensity',
      },
      {
        term: 'Stitch density',
        definition:
          'How closely stitches or rows are packed. More density means less spacing and more fabric stress.',
        keywords: 'density fillspacing maxdensity',
      },
      {
        term: 'Density-neutral gradient',
        definition:
          'A multicolor blend where each candidate row belongs to exactly one color, keeping total row density constant.',
        keywords: 'gradientrows gradientrowsn gradient fill error diffusion',
      },
      {
        term: 'Error diffusion',
        definition:
          'A deterministic way to distribute gradient rows among colors while carrying rounding error forward.',
        keywords: 'gradientrows gradientrowsn',
      },
      {
        term: 'Knockdown',
        definition:
          'A sparse foundation that flattens fleece, terry, or pile before the visible design is sewn.',
        keywords: 'knockdown',
      },
      {
        term: 'Bordered fill',
        definition:
          'A filled region finished with a satin or running-stitch border that overlaps the fill edge.',
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
        keywords: 'fabricgrain grain heading',
      },
      {
        term: 'Along / across stretch',
        definition: 'Separate stretch amounts parallel and perpendicular to the fabric grain.',
        keywords: 'fabricstretch directional anisotropic',
      },
      {
        term: 'Pull compensation',
        definition:
          'Extra width or length added to counter thread tension pulling a stitched shape inward.',
        keywords: 'pullcomp compensation',
      },
      {
        term: 'Directional compensation',
        definition:
          'Pull compensation projected from fabric grain and stretch onto the physical direction of satin or fill stitches.',
        keywords: 'compensation directional fabricgrain fabricstretch',
      },
      {
        term: 'Push compensation',
        definition:
          'A correction for stitched shapes lengthening along the direction of sewing; NeedleScript records it in the physics model but does not yet apply it.',
        keywords: 'push fabric physics',
      },
      {
        term: 'Thread profile / weight',
        definition:
          'A named thread material and size, such as polyester 40 wt; a larger weight number denotes a finer thread.',
        keywords: 'threadprofile rayon polyester 40wt 60wt',
      },
      {
        term: 'Thread width',
        definition:
          'The approximate physical width of the laid thread, used to estimate coverage rather than to change stitch geometry.',
        keywords: 'threadwidth',
      },
      {
        term: 'Needle size',
        definition:
          'The metric needle diameter category; for example, size 75 means about 0.75 mm at the blade.',
        keywords: 'needle nm',
      },
      {
        term: 'Stabilizer',
        definition:
          'Supporting material beneath the fabric, such as cutaway, tearaway, or washaway, that resists distortion.',
        keywords: 'stabilizer cutaway tearaway washaway',
      },
      {
        term: 'Fabric topping',
        definition:
          'A removable material placed above fleece or pile so stitches do not sink in; distinct from the visible topping layer.',
        keywords: 'topping water soluble pile fleece',
      },
      {
        term: 'Puckering',
        definition: 'Fabric wrinkling caused by tension, inadequate support, or excessive density.',
      },
      {
        term: 'Sew-out',
        definition:
          'A physical test stitched on the intended fabric, thread, stabilizer, and machine.',
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
        keywords: 'applique appliquewith appliquesteps',
      },
      {
        term: 'Placement line',
        definition: 'A first outline showing where the appliqué fabric should be positioned.',
        keywords: 'placement',
      },
      {
        term: 'Tackdown',
        definition: 'A second outline that holds the appliqué fabric in place before finishing.',
        keywords: 'tackdown inset',
      },
      {
        term: 'Cover stitch',
        definition:
          'The finishing border, commonly satin, that covers the cut edge of appliqué fabric.',
        keywords: 'cover width',
      },
      {
        term: 'Stop',
        definition:
          'A machine pause used for actions such as placing or trimming appliqué fabric or changing thread.',
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
        keywords: 'plan planning',
      },
      {
        term: 'Travel planning',
        definition:
          'Reordering eligible thread runs to shorten jumps while preserving colors and construction constraints.',
        keywords: 'plan nearest reversing-nearest',
      },
      {
        term: 'Route group',
        definition: 'An explicit collection of independent runs that the planner may reorder.',
        keywords: 'routegroup',
      },
      {
        term: 'Atomic construction',
        definition:
          'A complete item whose internal stitches stay together and in order even if the planner moves the whole item.',
        keywords: 'atomic',
      },
      {
        term: 'Plan barrier',
        definition: 'A fixed authored boundary that travel planning may not move runs across.',
        keywords: 'planbarrier',
      },
      {
        term: 'Run reversal',
        definition:
          'Sewing a safe thread run from its opposite end to shorten travel without changing its stitched geometry.',
        keywords: 'reversing-nearest plan',
      },
      {
        term: 'Preflight',
        definition:
          'A deterministic post-run check for sewability issues such as density, long floats, hoop overflow, and layer order.',
        keywords: 'preflight warn strict issue diagnostic',
      },
      {
        term: 'Machine profile',
        definition:
          'Local machine limits and calibration data applied at run time rather than stored in a portable design.',
        keywords: 'RunOptions calibration correction',
      },
      {
        term: 'Calibration',
        definition:
          'Measurements from a known test pattern used to correct a particular machine’s scale, skew, or reach.',
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
      },
      {
        term: 'Heading',
        definition: 'A compass-like degree angle: 0 is north and positive angles turn clockwise.',
      },
      {
        term: 'Local / design space',
        definition: 'Coordinates before the active transforms map geometry into the physical hoop.',
        keywords: 'local frame design space',
      },
      {
        term: 'Hoop space',
        definition:
          'Final physical coordinates, measured in millimeters, where stitches, compensation, coverage, and machine limits apply.',
      },
      {
        term: 'Hoop',
        definition: 'The frame that holds fabric taut and defines the intended sewable field.',
      },
      {
        term: 'Transform',
        definition:
          'A mapping such as translate, rotate, scale, mirror, or skew, applied before physical stitch rules.',
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
      },
      {
        term: 'Compound region',
        definition: 'A region with multiple rings, allowing holes or separate filled components.',
        keywords: 'rings components fill region',
      },
      {
        term: 'Even-odd rule',
        definition:
          'A point is inside when a ray crosses an odd number of boundary rings, so nested inner rings form holes.',
      },
      {
        term: 'Containment',
        definition:
          'The requirement that a stitch, connector, or offset stays inside its construction region and outside holes.',
        keywords: 'inside fillconnect declump',
      },
      {
        term: 'Resampling',
        definition: 'Redistributing path points at controlled spacing for clean stitching.',
      },
      {
        term: 'Warp',
        definition: 'A custom per-point deformation applied before stitch splitting.',
      },
      {
        term: 'Trace',
        definition: 'A sandboxed drawing block that captures a path as data without sewing.',
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
      },
      {
        term: 'Seed',
        definition: 'The number that determines all seeded random output in a program.',
      },
      {
        term: 'Scoped construction settings',
        definition:
          'Temporary stitch settings restored when a stitchscope block exits; movement, color, and output are not restored.',
        keywords: 'stitchscope snapshot restore sticky settings',
      },
      {
        term: 'Simplex noise',
        definition: 'Smooth seeded variation for organic fields and coherent drift.',
      },
      {
        term: 'Poisson-disc sampling',
        definition: 'Random-looking points kept a minimum distance apart.',
      },
      {
        term: 'Voronoi diagram',
        definition: 'A division of space into one nearest-point cell per input point.',
      },
      {
        term: 'Lloyd’s relaxation',
        definition: 'Repeatedly moving points to cell centroids for more even spacing.',
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
              <div key={term.term} className={styles.glossEntry}>
                <span className={styles.term}>{term.term}</span>
                <span className={styles.desc}>{term.definition}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
