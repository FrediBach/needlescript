import languageReference from '../../../needlescript-language-reference.md?raw';
import {
  LANGUAGE_REFERENCE_CATEGORIES,
  filterLanguageReferenceFeatures,
  filterLanguageReferenceStandardLibraryProcedures,
  type LanguageReferenceFeature,
  type LanguageReferenceStandardLibraryProcedure,
} from '../../lib/language/reference.ts';
import { MarkdownContent } from './MarkdownContent';

interface LanguageReferenceContentProps {
  query: string;
}

interface StructuredQuery {
  category?: string;
  module?: string;
  tags: string[];
  text: string;
  active: boolean;
}

function parseStructuredQuery(query: string): StructuredQuery {
  const tags: string[] = [];
  let category: string | undefined;
  let module: string | undefined;
  let active = false;
  const text = query
    .replace(/(?:^|\s)(tag|category|module):([^\s]+)/giu, (_match, kind: string, value: string) => {
      active = true;
      if (kind.toLowerCase() === 'tag') tags.push(value);
      else if (kind.toLowerCase() === 'category') category = value;
      else module = value;
      return ' ';
    })
    .replace(/\s+/gu, ' ')
    .trim();
  return { category, module, tags, text, active };
}

function standardLibraryProcedureMarkdown(
  procedure: LanguageReferenceStandardLibraryProcedure,
): string {
  return `### \`${procedure.id}\`\n\n**Module:** ${procedure.moduleId}\n\n**Tags:** ${procedure.tags.join(', ')}\n\n${procedure.documentation}`;
}

function featureMarkdown(feature: LanguageReferenceFeature): string {
  const category = LANGUAGE_REFERENCE_CATEGORIES.find((item) => item.id === feature.category);
  const aliases = feature.aliases?.length ? `\n\n**Aliases:** ${feature.aliases.join(', ')}` : '';
  const aliasFor = feature.aliasFor ? `\n\n**Alias for:** \`${feature.aliasFor}\`` : '';
  const example = feature.editor.example
    ? `\n\n**Example**\n\n\`\`\`needlescript\n${feature.editor.example}\n\`\`\``
    : '';
  return `### \`${feature.label}\`\n\n**Category:** ${category?.title ?? feature.category}\n\n**Tags:** ${feature.tags.join(', ')}${aliases}${aliasFor}\n\n${feature.editor.documentation}${example}`;
}

export function LanguageReferenceContent({ query }: LanguageReferenceContentProps) {
  const structured = parseStructuredQuery(query);
  if (structured.active) {
    const normalizedCategory = structured.category?.toLowerCase();
    const features =
      !structured.module && normalizedCategory !== 'standard-library'
        ? filterLanguageReferenceFeatures({
            query: structured.text,
            category: structured.category,
            tags: structured.tags,
          })
        : [];
    const procedures =
      !normalizedCategory || normalizedCategory === 'standard-library'
        ? filterLanguageReferenceStandardLibraryProcedures({
            query: structured.text,
            module: structured.module,
            tags: structured.tags,
          })
        : [];
    const matches = [
      ...features.map(featureMarkdown),
      ...procedures.map(standardLibraryProcedureMarkdown),
    ];
    const markdown = matches.length
      ? `## Feature matches (${matches.length})\n\n${matches.join('\n\n')}`
      : '## No matching language features';
    return <MarkdownContent markdown={markdown} idPrefix="reference-filter" />;
  }
  return <MarkdownContent markdown={languageReference} idPrefix="reference" query={query} />;
}
