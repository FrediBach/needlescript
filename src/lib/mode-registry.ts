import { didYouMean } from './suggestions.ts';

export type ModeName<Modes extends readonly string[]> = Modes[number];

/** Preserve a literal mode tuple while documenting that it is a shared registry. */
export function defineModes<const Modes extends readonly string[]>(modes: Modes): Modes {
  return modes;
}

/** Return typed keys for registries whose object keys are their accepted modes. */
export function modeKeys<const Registry extends Readonly<Record<string, unknown>>>(
  registry: Registry,
): readonly Extract<keyof Registry, string>[] {
  return Object.keys(registry) as Extract<keyof Registry, string>[];
}

/** Resolve a mode case-insensitively while retaining its literal union type. */
export function resolveMode<const Modes extends readonly string[]>(
  value: string,
  modes: Modes,
): ModeName<Modes> | undefined {
  const normalized = value.toLowerCase();
  return modes.find((mode): mode is ModeName<Modes> => mode === normalized);
}

export function quotedModeChoices(modes: readonly string[]): string {
  return modes.map((mode) => `'${mode}'`).join(', ');
}

/** Standard unknown-mode diagnostic shared by construction and directive commands. */
export function unknownModeMessage(
  subject: string,
  value: string,
  modes: readonly string[],
): string {
  const normalized = value.toLowerCase();
  return `Unknown ${subject} '${normalized}'${didYouMean(normalized, modes)} — expected ${quotedModeChoices(modes)}`;
}
