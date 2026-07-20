import rawReference from '../../../needlescript-language-features.generated.json';

export type LanguageFeatureKind = 'keyword' | 'function' | 'variable' | 'constant';

export type LanguageFeatureCompletion =
  | { kind: 'text'; text: string }
  | { kind: 'modes' | 'mode-list'; source: string; quote: "'" | '"' };

export interface LanguageReferenceCategory {
  id: string;
  title: string;
  description: string;
}

export interface LanguageReferenceSection {
  id: string;
  title: string;
  order: number;
  tags: string[];
  humanMarkdown: string;
  compactMarkdown: string;
}

export interface LanguageReferenceFeature {
  id: string;
  label: string;
  category: string;
  tags: string[];
  aliases?: string[];
  aliasFor?: string;
  summary: string;
  editor: {
    kind: LanguageFeatureKind;
    detail: string;
    documentation: string;
    example?: string;
    completion: LanguageFeatureCompletion;
    isSnippet?: true;
    signatures?: string[][];
  };
}

export interface LanguageReferenceStandardLibraryGroup {
  id: string;
  title: string;
  order: number;
  tags: string[];
  procedureIds: string[];
}

export interface LanguageReferenceStandardLibraryModule {
  id: string;
  title: string;
  order: number;
  description: string;
  purpose: string;
  tags: string[];
  emitsStitches: 'never' | 'usually';
  rngDraws: string;
  groups: LanguageReferenceStandardLibraryGroup[];
}

export interface LanguageReferenceStandardLibraryProcedure {
  id: string;
  moduleId: string;
  name: string;
  params: string[];
  group: string;
  tags: string[];
  summary: string;
  documentation: string;
}

export interface LanguageReference {
  version: number;
  language: string;
  categories: LanguageReferenceCategory[];
  features: LanguageReferenceFeature[];
  standardLibrary: {
    modules: LanguageReferenceStandardLibraryModule[];
    procedures: LanguageReferenceStandardLibraryProcedure[];
  };
}

/** Authored JSON source used by generated documentation and editor language services. */
export const LANGUAGE_REFERENCE = rawReference as unknown as LanguageReference;

export const LANGUAGE_REFERENCE_CATEGORIES = LANGUAGE_REFERENCE.categories;
export const LANGUAGE_REFERENCE_FEATURES = LANGUAGE_REFERENCE.features;
export const LANGUAGE_REFERENCE_FEATURE_MAP = new Map(
  LANGUAGE_REFERENCE_FEATURES.map((feature) => [feature.label, feature]),
);
export const LANGUAGE_REFERENCE_STANDARD_LIBRARY_MODULES =
  LANGUAGE_REFERENCE.standardLibrary.modules;
export const LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURES =
  LANGUAGE_REFERENCE.standardLibrary.procedures;
export const LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURE_MAP = new Map(
  LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURES.map((procedure) => [procedure.id, procedure]),
);

export interface LanguageReferenceFeatureFilter {
  query?: string;
  category?: string;
  tags?: readonly string[];
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

/** Filter feature metadata without depending on Monaco or browser APIs. */
export function filterLanguageReferenceFeatures({
  query = '',
  category = '',
  tags = [],
}: LanguageReferenceFeatureFilter): LanguageReferenceFeature[] {
  const normalizedQuery = normalized(query);
  const normalizedCategory = normalized(category);
  const normalizedTags = tags.map(normalized).filter(Boolean);
  const categoryById = new Map(LANGUAGE_REFERENCE_CATEGORIES.map((item) => [item.id, item]));

  return LANGUAGE_REFERENCE_FEATURES.filter((feature) => {
    const categoryMetadata = categoryById.get(feature.category);
    const categoryMatches =
      !normalizedCategory ||
      normalized(feature.category) === normalizedCategory ||
      normalized(categoryMetadata?.title ?? '') === normalizedCategory;
    if (!categoryMatches) return false;
    if (
      !normalizedTags.every((tag) =>
        feature.tags.some((candidate) => normalized(candidate) === tag),
      )
    )
      return false;
    if (!normalizedQuery) return true;
    const searchable = [
      feature.label,
      ...(feature.aliases ?? []),
      feature.aliasFor ?? '',
      feature.category,
      categoryMetadata?.title ?? '',
      ...feature.tags,
      feature.summary,
      feature.editor.detail,
      feature.editor.documentation,
    ]
      .join('\n')
      .toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

export interface LanguageReferenceStandardLibraryFilter {
  query?: string;
  module?: string;
  tags?: readonly string[];
}

/** Filter bundled standard-library exports by module, tags, or documentation text. */
export function filterLanguageReferenceStandardLibraryProcedures({
  query = '',
  module = '',
  tags = [],
}: LanguageReferenceStandardLibraryFilter): LanguageReferenceStandardLibraryProcedure[] {
  const normalizedQuery = normalized(query);
  const normalizedModule = normalized(module);
  const normalizedTags = tags.map(normalized).filter(Boolean);
  const moduleById = new Map(
    LANGUAGE_REFERENCE_STANDARD_LIBRARY_MODULES.map((item) => [item.id, item]),
  );

  return LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURES.filter((procedure) => {
    const moduleMetadata = moduleById.get(procedure.moduleId);
    if (
      normalizedModule &&
      normalized(procedure.moduleId) !== normalizedModule &&
      normalized(procedure.moduleId.slice(4)) !== normalizedModule
    )
      return false;
    if (
      !normalizedTags.every((tag) =>
        procedure.tags.some((candidate) => normalized(candidate) === tag),
      )
    )
      return false;
    if (!normalizedQuery) return true;
    return [
      procedure.id,
      procedure.name,
      procedure.moduleId,
      moduleMetadata?.purpose ?? '',
      ...procedure.params,
      ...procedure.tags,
      procedure.summary,
      procedure.documentation,
    ]
      .join('\n')
      .toLowerCase()
      .includes(normalizedQuery);
  });
}
