import { useMemo } from 'react';
import styles from '../ReferenceDialog.module.css';

interface GlossaryTerm {
  term: string;
  definition: string;
}

interface GlossarySection {
  title: string;
  intro: string;
  terms: GlossaryTerm[];
}

const GLOSSARY: GlossarySection[] = [
  {
    title: 'Stitches & thread',
    intro: 'The physical marks that make up an embroidery design.',
    terms: [
      { term: 'Stitch', definition: 'Thread between two consecutive needle penetrations.' },
      {
        term: 'Running stitch',
        definition: 'An evenly spaced line of stitches; NeedleScript’s default mode.',
      },
      {
        term: 'Satin column',
        definition: 'A dense zigzag across a narrow spine, used for glossy borders and lettering.',
      },
      { term: 'Bean stitch', definition: 'A running stitch sewn repeatedly for a bolder line.' },
      {
        term: 'Blanket stitch',
        definition: 'An edge stitch with short prongs along one side of travel.',
      },
      { term: 'Jump / travel', definition: 'A needle-up move that carries thread without sewing.' },
      { term: 'Trim', definition: 'A thread cut that prevents a loose connector between regions.' },
    ],
  },
  {
    title: 'Fills & coverage',
    intro: 'How a region is covered with thread without damaging the fabric.',
    terms: [
      {
        term: 'Tatami fill',
        definition: 'Parallel, brick-offset running-stitch rows that cover a region.',
      },
      {
        term: 'Fill angle',
        definition: 'The direction of fill rows; it changes the way thread catches light.',
      },
      { term: 'Coverage', definition: 'Thread layers over an area, as reported by coverat.' },
      { term: 'Even-odd rule', definition: 'The rule that makes inner fill rings become holes.' },
      {
        term: 'Directional fill',
        definition: 'A fill that follows a heading field rather than straight rows.',
      },
    ],
  },
  {
    title: 'Fabric & finishing',
    intro: 'Tools that make stitched geometry sew out cleanly on real fabric.',
    terms: [
      {
        term: 'Underlay',
        definition: 'Stabilising stitches placed beneath visible satin or fill stitching.',
      },
      {
        term: 'Pull compensation',
        definition: 'Extra width or length that counters thread-tension shrinkage.',
      },
      { term: 'Puckering', definition: 'Fabric wrinkling caused by excessive thread density.' },
      {
        term: 'Tie-in / tie-off',
        definition: 'Small anchoring stitches applied at a thread start or end.',
      },
      {
        term: 'Hoop',
        definition: 'The frame that holds fabric taut and defines the sewable field.',
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
      { term: 'Local frame', definition: 'The turtle’s coordinates inside a transform block.' },
      {
        term: 'Hoop space',
        definition: 'The physical coordinates where stitches, density, and machine limits apply.',
      },
    ],
  },
  {
    title: 'Generative design',
    intro: 'Deterministic variation makes organic results editable and repeatable.',
    terms: [
      {
        term: 'Seed',
        definition: 'The number that determines all seeded random output in a program.',
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
  {
    title: 'Geometry & transforms',
    intro: 'Data-space tools for building and reusing motifs.',
    terms: [
      {
        term: 'Path / region',
        definition:
          'A path is a list of points; a region is a path with an implicit closing segment.',
      },
      {
        term: 'Resampling',
        definition: 'Redistributing path points at controlled spacing for clean stitching.',
      },
      {
        term: 'Affine transform',
        definition: 'A translate, rotate, scale, mirror, skew, or raw matrix mapping.',
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
];

const LEAD =
  'NeedleScript joins machine embroidery and generative programming. The language reference is the source of truth for command behaviour; this glossary introduces the craft and geometry vocabulary behind it.';

interface GlossaryContentProps {
  query: string;
}

export function GlossaryContent({ query }: GlossaryContentProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      GLOSSARY.map((section) => ({
        ...section,
        terms: section.terms.filter(
          (term) =>
            !normalizedQuery ||
            term.term.toLowerCase().includes(normalizedQuery) ||
            term.definition.toLowerCase().includes(normalizedQuery),
        ),
      })).filter((section) => section.terms.length > 0),
    [normalizedQuery],
  );

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
