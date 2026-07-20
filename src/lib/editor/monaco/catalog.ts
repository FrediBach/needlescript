// Monaco language-service adapter for the structured NeedleScript language reference.

import { PREFLIGHT_MODES } from '../../embroidery/preflight.ts';
import { PLAN_MODES } from '../../embroidery/travel-planner.ts';
import {
  FILL_UNDERLAY_PASS_KINDS,
  SATIN_UNDERLAY_PASS_KINDS,
} from '../../embroidery/underlay-profile.ts';
import { QWORD_BUILTINS } from '../../language/commands.ts';
import {
  LANGUAGE_REFERENCE_FEATURES,
  type LanguageFeatureKind,
  type LanguageReferenceFeature,
} from '../../language/reference.ts';

export type NSItemKind = LanguageFeatureKind;

export interface NSItem {
  label: string;
  kindName: NSItemKind;
  detail: string;
  documentation: string;
  /** Concise valid source shown after the hover/completion documentation. */
  example?: string;
  insertText: string;
  isSnippet?: boolean;
  params?: string[][];
  category: string;
  tags: string[];
  aliases?: string[];
  aliasFor?: string;
}

const MODE_SOURCES: Readonly<Record<string, readonly string[]>> = {
  ...QWORD_BUILTINS,
  plan: PLAN_MODES,
  preflight: PREFLIGHT_MODES,
  underlaypasses: SATIN_UNDERLAY_PASS_KINDS,
  fillunderlaypasses: FILL_UNDERLAY_PASS_KINDS,
};

function modeSnippet(
  label: string,
  values: readonly string[],
  quote: "'" | '"',
  list: boolean,
): string {
  const choice = `${quote}\${1|${values.join(',')}|}${quote}`;
  return `${label} ${list ? `[${choice}]` : choice}`;
}

function completionText(feature: LanguageReferenceFeature): string {
  const completion = feature.editor.completion;
  if (completion.kind === 'text') return completion.text;
  const values = MODE_SOURCES[completion.source];
  if (!values) throw new Error(`Unknown language-reference mode source: ${completion.source}`);
  return modeSnippet(feature.label, values, completion.quote, completion.kind === 'mode-list');
}

function toNSItem(feature: LanguageReferenceFeature): NSItem {
  return {
    label: feature.label,
    kindName: feature.editor.kind,
    detail: feature.editor.detail,
    documentation: feature.editor.documentation,
    ...(feature.editor.example ? { example: feature.editor.example } : {}),
    insertText: completionText(feature),
    ...(feature.editor.isSnippet ? { isSnippet: true } : {}),
    ...(feature.editor.signatures ? { params: feature.editor.signatures } : {}),
    category: feature.category,
    tags: feature.tags,
    ...(feature.aliases ? { aliases: feature.aliases } : {}),
    ...(feature.aliasFor ? { aliasFor: feature.aliasFor } : {}),
  };
}

export const NS_ITEMS: NSItem[] = LANGUAGE_REFERENCE_FEATURES.map(toNSItem);
export const NS_ITEM_MAP = new Map<string, NSItem>(NS_ITEMS.map((item) => [item.label, item]));
