import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { QWORD_BUILTINS } from '../src/lib/language/commands.ts';
import { PREFLIGHT_MODES } from '../src/lib/embroidery/preflight.ts';
import { PLAN_MODES } from '../src/lib/embroidery/travel-planner.ts';
import {
  FILL_UNDERLAY_PASS_KINDS,
  SATIN_UNDERLAY_PASS_KINDS,
} from '../src/lib/embroidery/underlay-profile.ts';
import { STANDARD_LIBRARY_PROCEDURES } from '../src/lib/language/standard-library/index.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const docsRoot = resolve(root, 'docs');
const sourcePath = resolve(docsRoot, 'needlescript-language-reference.json');
const modeSources = {
  ...QWORD_BUILTINS,
  plan: PLAN_MODES,
  preflight: PREFLIGHT_MODES,
  underlaypasses: SATIN_UNDERLAY_PASS_KINDS,
  fillunderlaypasses: FILL_UNDERLAY_PASS_KINDS,
};

function unique(values, description) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) throw new Error(`Duplicate ${description}: ${duplicates.join(', ')}`);
}

export function validateReference(reference) {
  if (reference.version !== 1)
    throw new Error(`Unsupported reference version: ${reference.version}`);
  if (!Array.isArray(reference.categories) || reference.categories.length === 0)
    throw new Error('Reference must define categories.');
  if (!Array.isArray(reference.sections) || reference.sections.length === 0)
    throw new Error('Reference must define sections.');
  if (!Array.isArray(reference.features) || reference.features.length === 0)
    throw new Error('Reference must define features.');

  unique(
    reference.categories.map(({ id }) => id),
    'category IDs',
  );
  unique(
    reference.sections.map(({ id }) => id),
    'section IDs',
  );
  unique(
    reference.features.map(({ id }) => id),
    'feature IDs',
  );
  unique(
    reference.features.map(({ label }) => label),
    'feature labels',
  );

  const categoryIds = new Set(reference.categories.map(({ id }) => id));
  const featureIds = new Set(reference.features.map(({ id }) => id));
  for (const feature of reference.features) {
    if (feature.id !== feature.label)
      throw new Error(`Feature ID must match its label: ${feature.id}/${feature.label}`);
    if (!categoryIds.has(feature.category))
      throw new Error(`Unknown category ${feature.category} on ${feature.id}`);
    if (!Array.isArray(feature.tags) || feature.tags.length === 0)
      throw new Error(`Feature ${feature.id} must have tags.`);
    if (!feature.tags.includes(feature.category))
      throw new Error(`Feature ${feature.id} tags must include its category.`);
    if (!feature.summary?.trim()) throw new Error(`Feature ${feature.id} needs a compact summary.`);
    if (!feature.editor?.documentation?.trim())
      throw new Error(`Feature ${feature.id} needs editor documentation.`);
    const completion = feature.editor.completion;
    if (!completion) throw new Error(`Feature ${feature.id} needs completion metadata.`);
    if (completion.kind !== 'text' && !modeSources[completion.source])
      throw new Error(`Feature ${feature.id} uses unknown mode source ${completion.source}.`);
    for (const alias of feature.aliases ?? []) {
      if (!featureIds.has(alias))
        throw new Error(`Feature ${feature.id} has unknown alias ${alias}.`);
    }
    if (feature.aliasFor && !featureIds.has(feature.aliasFor))
      throw new Error(`Feature ${feature.id} aliases unknown feature ${feature.aliasFor}.`);
  }

  const standardLibrary = reference.standardLibrary;
  if (!standardLibrary?.modules?.length || !standardLibrary?.procedures?.length)
    throw new Error('Reference must define standard-library modules and procedures.');
  unique(
    standardLibrary.modules.map(({ id }) => id),
    'standard-library module IDs',
  );
  unique(
    standardLibrary.procedures.map(({ id }) => id),
    'standard-library procedure IDs',
  );
  const modules = new Map(standardLibrary.modules.map((module) => [module.id, module]));
  const procedures = new Map(
    standardLibrary.procedures.map((procedure) => [procedure.id, procedure]),
  );
  const groupedProcedureIds = [];
  for (const module of standardLibrary.modules) {
    unique(
      module.groups.map(({ id }) => id),
      `${module.id} group IDs`,
    );
    for (const group of module.groups) {
      for (const procedureId of group.procedureIds) {
        const procedure = procedures.get(procedureId);
        if (!procedure)
          throw new Error(`${module.id} references unknown procedure ${procedureId}.`);
        if (procedure.moduleId !== module.id || procedure.group !== group.id)
          throw new Error(`${procedureId} is assigned to the wrong module or group.`);
        groupedProcedureIds.push(procedureId);
      }
    }
  }
  unique(groupedProcedureIds, 'grouped standard-library procedure IDs');
  if (groupedProcedureIds.length !== procedures.size)
    throw new Error('Every standard-library procedure must belong to exactly one group.');
  for (const procedure of standardLibrary.procedures) {
    if (!modules.has(procedure.moduleId))
      throw new Error(`${procedure.id} references unknown module ${procedure.moduleId}.`);
    if (!procedure.tags?.length || !procedure.tags.includes('standard-library'))
      throw new Error(`${procedure.id} must have standard-library tags.`);
  }
  const runtimeProcedures = new Map(
    STANDARD_LIBRARY_PROCEDURES.map((procedure) => [
      `${procedure.moduleId}.${procedure.name}`,
      procedure,
    ]),
  );
  const missingRuntimeDocs = [...runtimeProcedures.keys()].filter((id) => !procedures.has(id));
  const staleProcedureDocs = [...procedures.keys()].filter((id) => !runtimeProcedures.has(id));
  if (missingRuntimeDocs.length || staleProcedureDocs.length)
    throw new Error(
      `Standard-library coverage mismatch. Missing: ${missingRuntimeDocs.join(', ')}; stale: ${staleProcedureDocs.join(', ')}`,
    );
  for (const [id, runtime] of runtimeProcedures) {
    const documented = procedures.get(id);
    if (documented.params.join('\0') !== runtime.params.join('\0'))
      throw new Error(`Standard-library signature mismatch for ${id}.`);
  }
}

function markdownTableCell(value) {
  return oneLine(value).replace(/\|/gu, '\\|');
}

function humanFeatureIndex(reference) {
  const groups = reference.categories
    .map((category) => {
      const features = reference.features.filter((feature) => feature.category === category.id);
      if (features.length === 0) return '';
      const rows = features.map((feature) => {
        const aliases = feature.aliases?.length ? `; aliases: ${feature.aliases.join(', ')}` : '';
        return `| \`${feature.label}\` | ${markdownTableCell(feature.summary)} | ${feature.tags.join(', ')}${aliases} |`;
      });
      return `### ${category.title}\n\n${category.description}.\n\n| Feature | Summary | Tags |\n| --- | --- | --- |\n${rows.join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
  return `## ${reference.sections.length + 1}. Structured feature index\n\nThis index is generated from the same categorized feature records used by Monaco and the compact LLM edition. Use the dialog's \`tag:…\` and \`category:…\` search forms for metadata filtering.\n\n${groups}`;
}

function humanStandardLibraryIndex(reference) {
  const procedures = new Map(
    reference.standardLibrary.procedures.map((procedure) => [procedure.id, procedure]),
  );
  const modules = [...reference.standardLibrary.modules]
    .sort((a, b) => a.order - b.order)
    .map((module) => {
      const rows = module.groups.flatMap((group) =>
        group.procedureIds.map((id) => {
          const procedure = procedures.get(id);
          return `| \`${procedure.id}\` | \`${procedure.name}(${procedure.params.join(', ')})\` | ${markdownTableCell(procedure.summary)} |`;
        }),
      );
      return `### \`${module.id}\`\n\n${module.purpose}. RNG: ${module.rngDraws}\n\n| Import path | Signature | Summary |\n| --- | --- | --- |\n${rows.join('\n')}`;
    })
    .join('\n\n');
  return `## ${reference.sections.length + 2}. Standard library index\n\nImports use \`import std.module.procedure as alias\`. The dedicated [standard-library reference](./needlescript-standard-library-reference.md) contains extended examples and construction notes.\n\n${modules}`;
}

function humanMarkdown(reference) {
  const sections = [...reference.sections]
    .sort((a, b) => a.order - b.order)
    .map(({ humanMarkdown: markdown }) => markdown.trimEnd());
  return `${reference.preamble.trimEnd()}\n\n${sections.join('\n\n')}\n\n---\n\n${humanFeatureIndex(reference)}\n\n---\n\n${humanStandardLibraryIndex(reference)}\n`;
}

function oneLine(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function signatureText(feature) {
  const signatures = feature.editor.signatures;
  if (!signatures) return feature.label;
  return signatures.map((params) => `${feature.label}(${params.join(', ')})`).join(' | ');
}

function compactFeature(feature) {
  const relationships = [
    feature.aliases?.length ? `aliases: ${feature.aliases.join(', ')}` : '',
    feature.aliasFor ? `alias of: ${feature.aliasFor}` : '',
  ].filter(Boolean);
  const metadata = [feature.category, ...feature.tags.filter((tag) => tag !== feature.category)];
  const example = feature.editor.example ? ` Example: \`${oneLine(feature.editor.example)}\`.` : '';
  const relationshipText = relationships.length ? ` ${relationships.join('; ')}.` : '';
  return `- \`${signatureText(feature)}\` [${metadata.join(', ')}] — ${oneLine(feature.summary)}${relationshipText}${example}`;
}

function compactStandardLibrary(reference) {
  const procedures = new Map(
    reference.standardLibrary.procedures.map((procedure) => [procedure.id, procedure]),
  );
  return [...reference.standardLibrary.modules]
    .sort((a, b) => a.order - b.order)
    .map((module) => {
      const entries = module.groups.flatMap((group) =>
        group.procedureIds.map((id) => {
          const procedure = procedures.get(id);
          return `- \`${procedure.id}(${procedure.params.join(', ')})\` [${procedure.tags.join(', ')}] — ${oneLine(procedure.summary)}`;
        }),
      );
      return `### ${module.id}\n\n${module.purpose}. Emits stitches: ${module.emitsStitches}. RNG: ${module.rngDraws}\n\n${entries.join('\n')}`;
    })
    .join('\n\n');
}

function llmMarkdown(reference) {
  const categories = new Map(reference.categories.map((category) => [category.id, category]));
  const sections = [...reference.sections]
    .sort((a, b) => a.order - b.order)
    .map(({ title, compactMarkdown }) => `### ${title}\n\n${compactMarkdown.trim()}`)
    .join('\n\n');
  const featureGroups = reference.categories
    .map((category) => {
      const features = reference.features.filter((feature) => feature.category === category.id);
      if (features.length === 0) return '';
      return `### ${category.title}\n\n${category.description}.\n\n${features.map(compactFeature).join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
  for (const feature of reference.features) {
    if (!categories.has(feature.category)) throw new Error(`Unknown category ${feature.category}.`);
  }
  return `# NeedleScript Language Reference — Compact LLM Edition

> Generated from \`needlescript-language-reference.json\`. Prefer the JSON source for programmatic filtering and the human edition for extended rationale and examples.

## Grammar and semantic constraints

${sections}

## Feature catalog

Each entry is \`signature [category, tags] — summary\`. Signatures use call notation compactly even when classic prefix syntax is also accepted.

${featureGroups}

## Standard library

Standard-library procedures require an explicit top-level import. Entries use the complete import path and source-derived parameter list.

${compactStandardLibrary(reference)}
`;
}

function standardLibraryMarkdown(reference) {
  const library = reference.standardLibrary;
  const procedures = new Map(library.procedures.map((procedure) => [procedure.id, procedure]));
  const modules = [...library.modules]
    .sort((a, b) => a.order - b.order)
    .map((module, index) => {
      const groups = [...module.groups]
        .sort((a, b) => a.order - b.order)
        .map((group) => {
          const rows = group.procedureIds.map((id) => {
            const procedure = procedures.get(id);
            return `| \`${procedure.id}\` | ${markdownTableCell(procedure.documentation)} | ${procedure.tags.join(', ')} |`;
          });
          const table = rows.length
            ? `| Import path | Signature and behavior | Tags |\n| --- | --- | --- |\n${rows.join('\n')}`
            : '';
          return [
            `### ${group.title}`,
            standardLibraryNotes(group.beforeMarkdown),
            table,
            standardLibraryNotes(group.afterMarkdown),
          ]
            .filter(Boolean)
            .join('\n\n');
        })
        .join('\n\n');
      return `## ${index + 2}. \`${module.id}\` — ${module.description}\n\n> ${module.purpose}. Emits stitches: **${module.emitsStitches}**. RNG: ${module.rngDraws}\n\n${groups}`;
    })
    .join('\n\n---\n\n');
  const indexRows = [...library.modules]
    .sort((a, b) => a.order - b.order)
    .map(
      (module) =>
        `| \`${module.id}\` | ${module.purpose} | ${module.emitsStitches} | ${markdownTableCell(module.rngDraws)} |`,
    )
    .join('\n');
  return `${library.preamble.trimEnd()}\n\n## ${library.introductionTitle}\n\n${standardLibraryNotes(library.introductionMarkdown)}\n\n---\n\n${modules}\n\n---\n\n## ${library.modules.length + 2}. Quick module index\n\n| Module | Purpose | Emits stitches? | Main RNG draws |\n| --- | --- | --- | --- |\n${indexRows}\n\n${standardLibraryNotes(library.footerMarkdown)}\n`;
}

function standardLibraryNotes(markdown) {
  if (!markdown) return '';
  return markdown
    .split('\n')
    .filter((line) => line.trim() !== '---')
    .join('\n')
    .trim();
}

export async function generateReferenceFiles(reference) {
  validateReference(reference);
  const prettierOptions = { parser: 'markdown', singleQuote: true, printWidth: 100 };
  return {
    human: await format(humanMarkdown(reference), prettierOptions),
    llm: await format(llmMarkdown(reference), prettierOptions),
    standardLibrary: await format(standardLibraryMarkdown(reference), prettierOptions),
    featureData: await format(
      JSON.stringify({
        version: reference.version,
        language: reference.language,
        categories: reference.categories,
        features: reference.features,
        standardLibrary: {
          modules: reference.standardLibrary.modules.map((module) => ({
            ...module,
            groups: module.groups.map(({ id, title, order, tags, procedureIds }) => ({
              id,
              title,
              order,
              tags,
              procedureIds,
            })),
          })),
          procedures: reference.standardLibrary.procedures,
        },
      }),
      { parser: 'json', printWidth: 100 },
    ),
  };
}

async function main() {
  const check = process.argv.includes('--check');
  const reference = JSON.parse(await readFile(sourcePath, 'utf8'));
  const generated = await generateReferenceFiles(reference);
  const outputs = [
    [reference.generatedFiles.human, generated.human],
    [reference.generatedFiles.llm, generated.llm],
    [reference.generatedFiles.standardLibrary, generated.standardLibrary],
    [reference.generatedFiles.featureData, generated.featureData],
  ];
  const stale = [];
  for (const [relativePath, content] of outputs) {
    const path = resolve(docsRoot, relativePath);
    if (check) {
      const existing = await readFile(path, 'utf8').catch(() => '');
      if (existing !== content) stale.push(relativePath);
    } else {
      await writeFile(path, content);
    }
  }
  if (stale.length > 0) {
    throw new Error(`Generated language reference is stale: ${stale.join(', ')}`);
  }
  console.log(`${check ? 'Checked' : 'Generated'} ${outputs.map(([path]) => path).join(' and ')}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
