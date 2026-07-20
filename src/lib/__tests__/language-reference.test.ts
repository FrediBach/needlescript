import { describe, expect, it } from 'vitest';
import {
  ALIASES,
  BUILTIN_ARITY,
  CORE_COMMAND_NAMES,
  EFFECT_ARITY,
  FUNC_ARITY,
  GEN_CMDS,
  GEN_FUNCS,
  LIST_CMDS,
  LIST_FUNCS,
  QUERY_FUNCS,
  QWORD_BUILTINS,
  STRING_FUNCS,
  TRANSFORM_ARITY,
  ZERO_FUNCS,
} from '../language/commands.ts';
import {
  LANGUAGE_REFERENCE,
  LANGUAGE_REFERENCE_FEATURE_MAP,
  LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURE_MAP,
  filterLanguageReferenceFeatures,
  filterLanguageReferenceStandardLibraryProcedures,
} from '../language/reference.ts';
import { STANDARD_LIBRARY_PROCEDURES } from '../language/standard-library/index.ts';
import { NS_ITEM_MAP } from '../editor/monaco/catalog.ts';

describe('structured language reference', () => {
  it('assigns every feature a valid category and searchable tags', () => {
    const categories = new Set(LANGUAGE_REFERENCE.categories.map(({ id }) => id));
    expect(categories.size).toBe(LANGUAGE_REFERENCE.categories.length);
    expect(LANGUAGE_REFERENCE_FEATURE_MAP.size).toBe(LANGUAGE_REFERENCE.features.length);

    for (const feature of LANGUAGE_REFERENCE.features) {
      expect(categories.has(feature.category), feature.label).toBe(true);
      expect(feature.tags, feature.label).toContain(feature.category);
      expect(feature.tags.length, feature.label).toBeGreaterThan(1);
      expect(feature.summary.trim(), feature.label).not.toBe('');
      expect(feature.editor.documentation.trim(), feature.label).not.toBe('');
    }
  });

  it('covers canonical Core commands and every runtime alias', () => {
    for (const command of CORE_COMMAND_NAMES)
      expect(LANGUAGE_REFERENCE_FEATURE_MAP.has(command)).toBe(true);
    for (const [alias, canonical] of Object.entries(ALIASES)) {
      expect(LANGUAGE_REFERENCE_FEATURE_MAP.get(alias)?.aliasFor, alias).toBe(canonical);
      expect(LANGUAGE_REFERENCE_FEATURE_MAP.get(canonical)?.aliases, canonical).toContain(alias);
      expect(NS_ITEM_MAP.has(alias), alias).toBe(true);
    }
  });

  it('covers every name in the executable command and reporter registries', () => {
    const registeredNames = new Set([
      ...Object.keys(ALIASES),
      ...Object.keys(BUILTIN_ARITY),
      ...Object.keys(TRANSFORM_ARITY),
      ...Object.keys(EFFECT_ARITY),
      ...Object.keys(QWORD_BUILTINS),
      ...Object.keys(FUNC_ARITY),
      ...ZERO_FUNCS,
      ...Object.keys(LIST_FUNCS),
      ...Object.keys(LIST_CMDS),
      ...Object.keys(GEN_FUNCS),
      ...Object.keys(GEN_CMDS),
      ...Object.keys(QUERY_FUNCS),
      ...Object.keys(STRING_FUNCS),
    ]);
    const missing = [...registeredNames].filter(
      (name) => !LANGUAGE_REFERENCE_FEATURE_MAP.has(name) || !NS_ITEM_MAP.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('filters by category, tags, aliases, and documentation text', () => {
    expect(
      filterLanguageReferenceFeatures({ category: 'movement' }).map(({ label }) => label),
    ).toContain('fd');
    expect(
      filterLanguageReferenceFeatures({ tags: ['seeded'], query: 'normal' }).map(
        ({ label }) => label,
      ),
    ).toEqual(['gauss']);
    expect(
      filterLanguageReferenceFeatures({ query: 'clearscreen' }).map(({ label }) => label),
    ).toContain('cs');
  });

  it('covers and categorizes every bundled standard-library export', () => {
    expect(LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURE_MAP.size).toBe(
      STANDARD_LIBRARY_PROCEDURES.length,
    );
    for (const runtime of STANDARD_LIBRARY_PROCEDURES) {
      const id = `${runtime.moduleId}.${runtime.name}`;
      const documented = LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURE_MAP.get(id);
      expect(documented?.params, id).toEqual(runtime.params);
      expect(documented?.tags, id).toContain('standard-library');
      expect(documented?.documentation.trim(), id).not.toBe('');
    }
  });

  it('filters standard-library procedures by module, tags, and documentation', () => {
    expect(filterLanguageReferenceStandardLibraryProcedures({ module: 'std.shapes' })).toHaveLength(
      13,
    );
    expect(
      filterLanguageReferenceStandardLibraryProcedures({
        module: 'mathx',
        tags: ['rng'],
        query: 'Bernoulli',
      }).map(({ id }) => id),
    ).toEqual(['std.mathx.chance']);
  });
});
