import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor, IMarkdownString, languages } from 'monaco-editor';
import { NS_ITEMS, NS_ITEM_MAP, type NSItemKind } from './catalog.ts';
import {
  codePortionOfLine,
  extractUserSymbols,
  getImportCompletionContext,
  getSignatureContext,
} from './symbols.ts';
import type { UserSymbol } from './symbols.ts';
import { STANDARD_LIBRARY_PROCEDURES } from '../../language/standard-library/index.ts';

type IPos = { readonly lineNumber: number; readonly column: number };

interface SymbolCacheEntry {
  version: number;
  symbols: UserSymbol[];
}

const symbolCache = new WeakMap<MonacoEditor.ITextModel, SymbolCacheEntry>();

function catalogDocumentation(item: (typeof NS_ITEMS)[number]): string {
  if (!item.example) return item.documentation;
  return `${item.documentation}\n\n**Example**\n\n\`\`\`needlescript\n${item.example}\n\`\`\``;
}

function userSymbolsFor(model: MonacoEditor.ITextModel): UserSymbol[] {
  const version = model.getVersionId();
  const cached = symbolCache.get(model);
  if (cached?.version === version) return cached.symbols;

  const symbols = extractUserSymbols(model.getValue());
  symbolCache.set(model, { version, symbols });
  return symbols;
}

export function registerNeedlescriptProviders(monaco: Monaco): void {
  const CIK = monaco.languages.CompletionItemKind;
  const kindMap: Record<NSItemKind, number> = {
    keyword: CIK.Keyword,
    function: CIK.Function,
    variable: CIK.Variable,
    constant: CIK.Constant,
  };
  const SNIPPET_RULE = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  const builtInCompletions = NS_ITEMS.map((item) => ({
    label: item.label,
    kind: kindMap[item.kindName],
    detail: item.detail,
    documentation: {
      value: catalogDocumentation(item),
      isTrusted: true,
    } as IMarkdownString,
    insertText: item.insertText,
    insertTextRules: item.isSnippet ? SNIPPET_RULE : undefined,
  }));

  // ── Completion provider ───────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider('needlescript', {
    triggerCharacters: ['.'],

    provideCompletionItems(model: MonacoEditor.ITextModel, position: IPos) {
      const lineBeforeCursor = model
        .getLineContent(position.lineNumber)
        .slice(0, position.column - 1);
      const importContext = getImportCompletionContext(lineBeforeCursor);
      if (importContext) {
        const importRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: importContext.startColumn,
          endColumn: position.column,
        };
        const suggestions = STANDARD_LIBRARY_PROCEDURES.flatMap((procedure) => {
          const importPath = `${procedure.moduleId}.${procedure.name}`;
          if (!importPath.startsWith(importContext.partialPath)) return [];

          const signature = `${procedure.name}(${procedure.params.join(', ')})`;
          return [
            {
              label: importPath,
              kind: CIK.Module,
              detail: signature,
              documentation: {
                value: `Import \`${signature}\` from \`${procedure.moduleId}\`.`,
                isTrusted: false,
              } as IMarkdownString,
              filterText: importPath,
              insertText: `${importPath} as ${procedure.name}`,
              range: importRange,
            },
          ];
        });
        return { suggestions };
      }

      const wordInfo = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      // Built-in completions
      const suggestions = builtInCompletions.map((item) => ({
        ...item,
        range,
      }));

      // User-defined completions (scanned from the current document)
      const userSymbols = userSymbolsFor(model);
      for (const sym of userSymbols) {
        const userKind = sym.kindName === 'function' ? CIK.Function : CIK.Variable;

        if (sym.kindName === 'function' && sym.params && sym.params.length > 0) {
          const snippetText = `${sym.label}(${sym.params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`;
          suggestions.push({
            label: sym.label,
            kind: userKind,
            detail: sym.detail,
            documentation: {
              value: sym.documentation ?? `User-defined procedure.`,
              isTrusted: false,
            },
            insertText: snippetText,
            insertTextRules: SNIPPET_RULE,
            range,
          });
        } else {
          suggestions.push({
            label: sym.label,
            kind: userKind,
            detail: sym.detail,
            documentation: {
              value: sym.documentation ?? `User-defined ${sym.kindName}.`,
              isTrusted: false,
            },
            insertText: sym.label,
            insertTextRules: undefined,
            range,
          });
        }
      }

      return { suggestions };
    },
  });

  // ── Hover provider ────────────────────────────────────────────────
  monaco.languages.registerHoverProvider('needlescript', {
    provideHover(model: MonacoEditor.ITextModel, position: IPos) {
      const wordAtPos = model.getWordAtPosition(position);
      if (!wordAtPos) return null;

      const wordLower = wordAtPos.word.toLowerCase();

      // ── Built-in hover ───────────────────────────────────────────
      const item = NS_ITEM_MAP.get(wordLower);
      if (item) {
        // Build signature from params (first overload)
        let sigLine = `**${item.label}**`;
        if (item.params) {
          const firstOverload = item.params[0];
          if (firstOverload.length > 0) {
            sigLine += ` \`(${firstOverload.join(', ')})\``;
          } else {
            // Bare zero-arg values are reporters; function-kind items use call syntax.
            sigLine += item.kindName === 'variable' ? ' *(reporter)*' : ' `()`';
          }
        }

        const content = `${sigLine}\n\n${catalogDocumentation(item)}`;

        return {
          contents: [{ value: content, isTrusted: true }],
        };
      }

      // ── User-defined symbol hover ────────────────────────────────
      const userSymbols = userSymbolsFor(model);
      const sym = userSymbols.find((s) => s.label === wordLower);
      if (!sym) return null;

      let sigLine = `**${sym.label}**`;
      if (sym.kindName === 'function') {
        const paramStr = sym.params && sym.params.length > 0 ? sym.params.join(', ') : '';
        sigLine += ` \`(${paramStr})\`  *(${sym.detail}, line ${sym.line})*`;
      } else {
        sigLine += `  *(user variable, line ${sym.line})*`;
      }

      const content = sym.documentation ? `${sigLine}\n\n${sym.documentation}` : sigLine;
      return { contents: [{ value: content, isTrusted: false }] };
    },
  });

  // ── Signature help provider ───────────────────────────────────────
  monaco.languages.registerSignatureHelpProvider('needlescript', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],

    provideSignatureHelp(model: MonacoEditor.ITextModel, position: IPos) {
      // Gather text from document start to cursor
      const textBefore = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const ctx = getSignatureContext(textBefore);
      if (!ctx) return null;

      // ── Built-in signature help ──────────────────────────────────
      const item = NS_ITEM_MAP.get(ctx.name);
      if (item && item.params) {
        // Build one SignatureInformation per overload
        const signatures = item.params.map((paramNames) => {
          const label =
            paramNames.length > 0 ? `${item.label}(${paramNames.join(', ')})` : `${item.label}()`;

          // Compute label ranges for each parameter
          const parameters = paramNames.map((paramName) => {
            const start = label.indexOf(paramName);
            const end = start + paramName.length;
            return {
              label: [start, end] as [number, number],
              documentation: undefined,
            };
          });

          return {
            label,
            documentation: {
              value: catalogDocumentation(item),
              isTrusted: true,
            } as IMarkdownString,
            parameters,
          };
        });

        if (signatures.length === 0) return null;

        // For overloaded functions (e.g. range, scatter), pick the overload
        // that best fits the number of arguments typed so far.
        let activeSignature = 0;
        const paramCount = ctx.paramIndex + 1;
        for (let i = 0; i < signatures.length; i++) {
          if (signatures[i].parameters.length >= paramCount) {
            activeSignature = i;
            break;
          }
        }

        // Cap the active parameter index at the last parameter in this overload
        const sig = signatures[activeSignature];
        const activeParam = Math.min(ctx.paramIndex, sig.parameters.length - 1);

        return {
          value: {
            signatures,
            activeSignature,
            activeParameter: Math.max(0, activeParam),
          },
          dispose() {},
        };
      }

      // ── User-defined procedure signature help ────────────────────
      const userSymbols = userSymbolsFor(model);
      const userProc = userSymbols.find((s) => s.label === ctx.name && s.kindName === 'function');
      if (!userProc || !userProc.params) return null;

      const paramNames = userProc.params;
      const procLabel = `${userProc.label}(${paramNames.join(', ')})`;
      const parameters = paramNames.map((pname) => {
        const start = procLabel.indexOf(pname);
        const end = start + pname.length;
        return { label: [start, end] as [number, number], documentation: undefined };
      });

      const activeParam =
        paramNames.length > 0 ? Math.min(ctx.paramIndex, paramNames.length - 1) : 0;

      return {
        value: {
          signatures: [
            {
              label: procLabel,
              documentation: {
                value: userProc.documentation ?? `User-defined procedure (line ${userProc.line}).`,
                isTrusted: false,
              } as IMarkdownString,
              parameters,
            },
          ],
          activeSignature: 0,
          activeParameter: Math.max(0, activeParam),
        },
        dispose() {},
      };
    },
  });

  // ── Folding range provider ────────────────────────────────────────
  // Produces fold regions for:
  //   • [ … ]  blocks — for repeat/if/while/for/def/stitchscope/transform bodies
  //   • to … end  blocks — classic Logo procedure definitions
  // Comments are stripped from each line before scanning, so brackets
  // inside // # ; comments do not produce stray fold regions.
  monaco.languages.registerFoldingRangeProvider('needlescript', {
    provideFoldingRanges(model: MonacoEditor.ITextModel) {
      const lineCount = model.getLineCount();
      const ranges: languages.FoldingRange[] = [];

      // Stack of line numbers where an unmatched `[` was seen
      const bracketStack: number[] = [];
      // Stack of line numbers where `to name …` was seen
      const toStack: number[] = [];

      for (let lineNum = 1; lineNum <= lineCount; lineNum++) {
        const codeLine = codePortionOfLine(model.getLineContent(lineNum));

        // Scan for `[` and `]` in the code portion of this line
        for (let ci = 0; ci < codeLine.length; ci++) {
          const ch = codeLine[ci];
          if (ch === '[') {
            bracketStack.push(lineNum);
          } else if (ch === ']') {
            if (bracketStack.length > 0) {
              const startLine = bracketStack.pop()!;
              if (startLine < lineNum) {
                ranges.push({ start: startLine, end: lineNum });
              }
            }
          }
        }

        // Detect `to name …` procedure header lines
        if (/^\s*to\s+[a-z_]/i.test(codeLine)) {
          toStack.push(lineNum);
        } else if (/^\s*end(\s|$)/i.test(codeLine) && toStack.length > 0) {
          const startLine = toStack.pop()!;
          if (startLine < lineNum) {
            ranges.push({ start: startLine, end: lineNum });
          }
        }
      }

      return ranges;
    },
  });
}

export function registerNeedlescriptDefinitionProvider(monaco: Monaco): void {
  // F12 / Ctrl+click on a user-defined procedure name or variable
  // jumps to the line where it is defined.  Built-in names are ignored
  // (they have no source location within the user's file).
  monaco.languages.registerDefinitionProvider('needlescript', {
    provideDefinition(model: MonacoEditor.ITextModel, position: IPos) {
      const wordAtPos = model.getWordAtPosition(position);
      if (!wordAtPos) return null;

      const wordLower = wordAtPos.word.toLowerCase();

      // Only navigate for user-defined symbols; built-ins have no source location.
      if (NS_ITEM_MAP.has(wordLower)) return null;

      const userSymbols = userSymbolsFor(model);
      const sym = userSymbols.find((s) => s.label === wordLower);
      if (!sym) return null;

      return {
        uri: model.uri,
        range: {
          startLineNumber: sym.line,
          startColumn: 1,
          endLineNumber: sym.line,
          endColumn: model.getLineLength(sym.line) + 1,
        },
      };
    },
  });
}
