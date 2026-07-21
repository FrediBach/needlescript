# NeedleScript Parser Architecture

NeedleScript is a Logo-inspired language for generative embroidery. This document
describes the front-end of the language toolchain — how raw source text becomes an
Abstract Syntax Tree (AST) — as implemented in `src/lib/`. It covers the tokenizer,
the pre-scan pass, the recursive-descent parser, and the supporting tables and
diagnostics.

The parser is deliberately platform-neutral: `src/lib/` has no DOM dependencies, no
UI concerns, and no side-effectful top-level code. It is the publishable core.

---

## 1. Pipeline overview

Source text flows through tokenization, compile-time module linking, and the existing
pre-scan/parser stages before it reaches the interpreter:

```
source string
     │
     ▼
┌─────────────────────────┐   Token[]
│       tokenize()        ├──────────────┐
│ language/tokenizer.ts   │              │
└─────────────────────────┘              ▼
                              ┌───────────────────────────┐   linked sources
                              │       module linker       ├────────────┐
                              │ language/module-linker.ts │            │
                              └───────────────────────────┘            ▼
                                                            ┌──────────────────┐
                                                            │ closure lowering │
                                                            └────────┬─────────┘
                                                                     ▼
                                                            ┌──────────────────────┐   ASTNode[]
                                                            │    prescan/parse     ├────────────► runtime
                                                            │ language/parser/*.ts │
                                                            └──────────────────────┘
```

The orchestration lives in `runtime/index.ts:30` (`run()`):

```ts
const tokens = tokenize(source); // 1. lexing
const parseNotes: string[] = [];
const program = linkStandardModules(tokens, parseNotes); // link, pre-scan, parse
// … program (ASTNode[]) is then executed by the interpreter
```

`parse()` still invokes `prescan()` internally for an individual source unit. Full
program execution inserts `linkStandardModules()` between tokenization and parsing;
both lower-level surfaces are re-exported from the library barrel.

Before pre-scan, `language/closure-lowering.ts` recognizes modern anonymous
`def(params) [ … ]` expressions. It builds lexical scope records, computes free
variables, rejects writes/shadowing and the 16-capture limit, then lambda-lifts each
body to a synthetic top-level procedure. The expression becomes an internal `$bind`
of that procedure to snapshot capture expressions. The internal spelling cannot be
shadowed by a user procedure named `bind`; downstream stages otherwise see ordinary
procedures and references.

Key design principle stated in `language/parser/index.ts:1-5`: the parser accepts **both**
classic Logo syntax **and** a modern syntax (RFC-1). Every modern form _lowers_ to
an existing AST node, so the interpreter, stitch machine, and file exporters never
need to know which surface syntax produced a node. Legacy programs keep working
unchanged.

---

## 2. The tokenizer (`language/tokenizer.ts`)

`tokenize(src: string): Token[]` is a single-pass, character-by-character scanner.
It tracks the current 1-based `line` for diagnostics and records `start`/`end`
character offsets on every token (used later for "glued token" disambiguation).

### 2.1 Token shape

Defined in `core/types.ts:3-16`:

```ts
type TokenType =
  'num' | 'string' | 'var' | 'qword' | 'word' | 'pref' | 'op' | '[' | ']' | '(' | ')' | ',';

interface Token {
  t: TokenType;
  v?: string | number; // value (name, number, string contents…)
  line: number;
  start: number; // inclusive char offset
  end: number; // exclusive char offset
  spBefore?: boolean; // operator had whitespace before it
  spAfter?: boolean; // operator had whitespace after it
}
```

The `start`/`end` offsets are load-bearing: the parser uses them to detect whether a
`(` or `[` is **glued** (immediately adjacent, no space) to the preceding token,
which is how call syntax and index syntax are distinguished from grouped
expressions and block openers.

### 2.2 Token kinds produced

| Kind     | Source form                     | Notes                                                                  |
| -------- | ------------------------------- | ---------------------------------------------------------------------- |
| `num`    | `42`, `3.14`, `.5`              | `true`/`false` fold to `1`/`0` (`language/tokenizer.ts:164`)           |
| `string` | `'text'`                        | single-quoted, must close on the same line; escapes `\' \\ \n \t` only |
| `var`    | `:name`                         | legacy Logo variable reference                                         |
| `qword`  | `"word` or `"word"`             | quoted word; closing quote optional (modern style)                     |
| `word`   | `fd`, `myproc`, `and`           | bare identifier / keyword                                              |
| `pref`   | `@name`                         | procedure/function reference value (RFC effects §1)                    |
| `op`     | `+ - * / < > = <= >= != % += …` | carries `spBefore`/`spAfter`                                           |
| brackets | `[ ] ( ) ,`                     | structural                                                             |

### 2.3 Notable lexing rules

- **Comments**: `;`, `#`, and `//` all run to end of line (`language/tokenizer.ts:25`). A lone
  `/` remains division.
- **`..`** is reserved for future syntax and errors immediately (`language/tokenizer.ts:44`).
- **Strings** are loud on failure: unterminated strings and unknown escape sequences
  throw `NeedlescriptError` rather than silently recovering (`language/tokenizer.ts:50-86`).
- **Operators** use maximal munch: `<=`, `>=`, `!=`, `==` (normalized to `=`), and
  the compound-assignment ops `+= -= *= /=` are recognized as single tokens
  (`language/tokenizer.ts:87-113`). Prefix `!` is emitted as the `word` token `not`.
- **`spBefore`/`spAfter`** on operators encode the Logo convention that ` -5` (space
  before, glued after) is a negative literal, not subtraction — the parser consults
  these flags in `parseAdd` (`expressions.ts:163`).
- **`qword` maximal munch** (`language/tokenizer.ts:142-159`): `"knit` and `"knit"` produce
  the same token; the optional closing quote is O(1) look-local so two qwords on one
  line still lex separately.
- **`@name`** yields a `pref` token — one new token kind that stays out of the way of
  every existing program.

`COMPOUND_ASSIGN_OPS` (`language/tokenizer.ts:7`) is exported for reuse by both the parser and
the pre-scan.

---

## 3. The pre-scan (`language/prescan.ts`)

Recursive-descent needs to resolve bare identifiers _at parse time_ — is `leaf` a
procedure call, a variable read, or unknown? Because NeedleScript allows a procedure
to be **called before it is defined** in source order, a single left-to-right parse
cannot know every name. `prescan()` solves this with a preliminary pass family over
the token stream.

### 3.1 What it collects

`PreScan` (`language/prescan.ts:21-30`):

```ts
interface PreScan {
  procArity: Record<string, number>; // proc name → parameter count
  procLine: Record<string, number>; // proc name → header line (for errors)
  procLocals: Record<string, Set<string>>; // proc name → local variable names
  globalNames: Set<string>; // names that may hold a global value
}
```

Because NeedleScript has **no computed names** (every binding target is a literal
token), the pre-scan is _exact_ for name existence. Whether a registered name holds a
_value_ at read time is deferred to the interpreter (its "never assigned" runtime
error).

### 3.2 The `walk` helper and passes

`walk()` (`language/prescan.ts:41-90`) streams tokens while tracking procedure context: which
procedure body a token sits in (`to … end` versus `def … ( … ) [ … ]`) and whether
the cursor is inside the bound expressions of a keyword-`for` (where `to` is
contextual, not a procedure header — `step` is also contextual here but is not
globally reserved, so no prescan guard is needed for it). It invokes a visitor
`(i, inProc, forBounds)` per token.

`prescan()` runs several passes:

1. **Pass 1 — signatures** (`language/prescan.ts:102`): collect procedure names and arity from
   both `to name :a :b` headers and `def name(a, b)` headers. Runs first so that
   assignment targets that are actually procedure names are skipped.
2. **Pass 2a — explicit declarations** (`language/prescan.ts:152`): `make "x`, `local "x`,
   `let x = …`, `let [x, y] = …` destructuring, and `for` counters (classic, modern
   `=`, and `for x in xs`).
3. **Pass 2b — assignment targets** (`language/prescan.ts:200`): bare `x = …` / `x += …` in
   statement position. This heuristic may over-approximate (e.g. it also matches
   `if x = 1`), but over-approximation only ever _adds_ a candidate name — turning a
   would-be parse-time "unknown name" into at worst a runtime "never assigned". It can
   never cause a misparse, because reserved words and procedure names are excluded by
   `register()` (`language/prescan.ts:145-149`). Zero-argument Library reporters are excluded
   from this heuristic because `if repcount = 3` is a common comparison; when one is
   actually assigned at statement position, the parser records the name immediately
   for subsequent reads.

The distinction between locals and globals is enforced here: a name registered inside
a procedure and either force-local (params, `let`, `local`, `for`) or already known
local becomes a local; otherwise it is global.

### 3.3 Compile-time source modules (`language/module-linker.ts`)

`linkStandardModules(rootTokens, notes)` recognizes top-level module directives before
ordinary parsing:

```text
import std.textures.radialdir as radial
export def radialdir(p) [ return vheading(p) ]
```

An import specifier splits at its final dot: `std.textures` is the module ID and
`radialdir` is the exported procedure. Bundled source is resolved from the pure registry
in `language/standard-library/index.ts`; non-`std.*` IDs are rejected for now. The resolver
boundary is deliberately separate from parsing so a future host resolver can supply user
module source without adding filesystem or network APIs to `src/lib/`.

The linker parses each module as its own source unit. `parse()` accepts an optional map of
known imported procedure signatures so imported aliases participate in arity checking and
forward resolution during pre-scan. It then rewrites local and imported procedure symbols
to stable module-qualified names, prepends each module once in dependency order, and runs
the reporter-path check over the combined AST. Linked module procedure nodes retain an internal
`sourceId` so runtime provenance never mistakes a module-local line for a line in the active user
source. The interpreter consequently receives the
same ordinary `to`/call AST it has always executed; import/export have no runtime nodes,
side effects, or RNG behavior.

For this first standard-library foundation, modules may contain only imports and procedure
definitions, and only procedures can be exported. `export` directly prefixes `def` or
classic `to`. This keeps modules deterministic and gives private helpers collision-free
module scope while leaving room for exported values and host resolvers later.

---

## 4. The parser (`language/parser/`)

The parser is a recursive-descent parser split across four files plus a shared
context object. The split exists to keep each file focused and to break the mutual
import dependency between expression and statement parsing.

```
language/parser/
├── index.ts        entry point: parse(), ParseContext construction, parseProgram
├── context.ts      ParseContext interface (shared mutable state + helpers)
├── expressions.ts  precedence ladder, primaries, argument lists, postfix chains
├── statements.ts   statement dispatcher, blocks, headers
└── analysis.ts     static control-flow analysis (reporter-path checking)
```

### 4.1 The `ParseContext` pattern

Rather than a class with `this`, the parser uses a single plain object,
`ParseContext` (`context.ts:11-69`), that carries **all** mutable state plus utility
methods and cross-module function references. Every sub-parser takes `ctx` as its
first argument.

Mutable state includes:

| Field             | Purpose                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `pos`             | current token cursor                                                                                    |
| `currentProc`     | name of the procedure being parsed, or `null` at top level                                              |
| `loopDepth`       | how many loop bodies enclose the cursor (RFC-4 `break`/`continue`); reset to 0 inside `to`/`def` bodies |
| `declaredGlobal`  | global names declared so far (double-`let` detection)                                                   |
| `declaredLocal`   | per-procedure declared names                                                                            |
| `headerCtx`       | true while parsing a `repeat`/`while`/`if`/`for` header expression                                      |
| `lastHeaderIndex` | last glued-index seen in a header, for `[` disambiguation errors                                        |
| `shadowNoted`     | library-tier names already noted as shadowed                                                            |
| `ps`              | the full `PreScan` result                                                                               |

Cross-module references (`parseExpr`, `parsePrimary`, `parseBracketBlock`,
`parseParenArgs`, `parseParenArgsRange`) are stored as `ctx` properties and wired in
`index.ts` after all modules load (`index.ts:190-208`). This is the mechanism that
lets `expressions.ts` (which needs `parseBracketBlock` for `trace [ … ]`) and
`statements.ts` (which needs `parseExpr` and friends) call into each other without a
circular `import`.

The context also owns the diagnostic helpers:

- `builtinKind(w)` — classifies a name as built-in function / command / reserved word
  (`index.ts:139`).
- `checkBindable` / `checkParam` — reject binding a builtin/reserved/procedure name
  (`index.ts:150-162`).
- `nameCandidates()` — builds the full name→kind map used for "did you mean?"
  suggestions (`index.ts:163`).
- `noteLibraryShadow(name)` — pushes a one-time note when a user procedure shadows a
  Library-tier builtin (`index.ts:182`).

### 4.2 Entry point and the top-level loop

`parse(tokens, notes?)` (`index.ts:72`):

1. Runs `prescan(tokens)`.
2. Builds the `ParseContext`, closing every method over `ctx`.
3. Calls `parseProgram(ctx)`.

`parseProgram` (`index.ts:38`) loops `parseStatement` until the token stream is
exhausted, then runs the reporter-path check (see §4.6).

### 4.3 Expression parsing (`expressions.ts`)

The precedence ladder is a classic chain of mutually recursive functions, lowest to
highest precedence:

```
parseExpr → parseOr → parseAnd → parseCompare → parseAdd → parseMul
          → parseUnary → parsePrimary → parsePostfix
```

| Level          | Operators / forms                                 | Location             |
| -------------- | ------------------------------------------------- | -------------------- |
| `parseOr`      | `or`                                              | `expressions.ts:128` |
| `parseAnd`     | `and`                                             | `expressions.ts:137` |
| `parseCompare` | `< > = <= >= !=`                                  | `expressions.ts:146` |
| `parseAdd`     | `+ -`                                             | `expressions.ts:155` |
| `parseMul`     | `* / %`                                           | `expressions.ts:170` |
| `parseUnary`   | prefix `-`                                        | `expressions.ts:189` |
| `parsePrimary` | literals, names, calls, `( … )`, `[ … ]`, `trace` | `expressions.ts:272` |
| `parsePostfix` | index `[i]` and `paths[i](…)` chains              | `expressions.ts:203` |

Notable lowerings and rules:

- **`%`** lowers to a `mod(a, b)` `func` node so there is a single modulo semantics in
  the engine (`expressions.ts:181-184`).
- **Logo negative-literal rule**: `parseAdd` breaks on `-` when `spBefore && !spAfter`
  (`expressions.ts:163`).
- **`parsePrimary`** is where the unified name resolution lives. For a bare `word` it
  resolves in order (§4.2 of RFC-1): local/global variable → zero-arg user reporter
  → Library-tier zero-arg reporter → built-in function → user procedure used as
  reporter → error
  (`expressions.ts:472-513`).
- **Glued-call syntax**: `name(args)` is a call only when `(` is glued to the name
  (`ctx.gluedParenNext`); `f (10)` with a space is a grouped expression. This gate
  dispatches to `func`, `callexpr`, `listfunc` etc. depending on what `name` resolves
  to (`expressions.ts:370-468`).
- **`@name`** (`pref` token) produces a `procref` node, accepting user procedures and
  value-returning builtins but rejecting statement-only builtins with a helpful
  message (`expressions.ts:302-332`).
- **Callable values** use `callval`: a reference held in a variable, list element,
  factory result, or composed expression may be followed by glued call parentheses.
  Non-reference values parse and fail with a runtime type diagnostic.
- **Postfix index chains** only engage when the preceding primary is a valid
  index left-context (bare identifier, `)`, or `]` — never a numeric literal or legacy
  `:var`) and the `[` is glued (`expressions.ts:203-238`).
- **`trace [ … ]` / `tracerings [ … ]`** are expression-only block forms that bind
  tighter than any operator; the body is parsed via `ctx.parseBracketBlock`
  (`expressions.ts:358-366`).

Argument-list helpers `parseParenArgs` / `parseParenArgsRange` (`expressions.ts:50-105`)
handle comma-separated lists with optional trailing commas and enforce arity, with
tailored error messages (e.g. the `push` vs `append` hint).

### 4.4 Statement parsing (`statements.ts`)

`parseStatement(ctx)` (`statements.ts:96`) is a large dispatcher keyed on the leading
`word`. It handles, among others:

- **Definitions**: `to name :a … end` (`statements.ts:112`) and modern
  `def name(a, b) [ … ]` (`statements.ts:147`) — both lower to the same `to` AST node.
- **Bindings**: `let` (with `let [x, y] = …` destructuring → `letlist`),
  `make`/`local`, and the modern `x = e` / `x += e` assignment (compound ops lower to
  `x = x + e`) (`statements.ts:218`, `438`, `513`).
- **Control flow**: `repeat`, `while`, `if`/`else`/`else if`, and three `for` forms —
  classic `for "i 0 10 1`, modern `for i = 1 to 10 step 2`, and `for x in xs`
  (`forin`) (`statements.ts:314-398`). `step` is recognised positionally in the
  modern form (string comparison on the peeked token after `to <expr>`) and is not
  globally reserved — `let step = 2` is valid everywhere outside a for header.
- **Returns**: `return`/`output`/`op` and bare `return`/`exit` (both → `output` with
  `value: null`) (`statements.ts:288`, `449`).
- **Loop control**: `break`/`continue`, guarded by `loopDepth` with a lexical error
  message when used inside a procedure whose loop is in the caller
  (`statements.ts:461`).
- **Block commands**: `transform`-family (CTM stack) and `effect`-family
  (`warp`/`humanize`/`snaptogrid`/`declump`), each taking args _then a block_ in both
  prefix and glued-call spellings (`statements.ts:409-436`, `566-590`).
- **Construction scope**: `stitchscope [ … ]` produces a dedicated block node. It
  preserves the surrounding `loopDepth`, so lexical `break`/`continue` validation
  works through the wrapper exactly as it does through `if`.
- **Planner constraints**: `atomic [ … ]` and `routegroup [ … ]` produce dedicated block nodes with
  the same lexical control-flow transparency. Runtime execution decides whether each is an inert
  wrapper or records an authored planner span.
- **Special commands**: `print`/`printloc`, `assert`, `mark`, `chalk` (one required
  plus two optional expressions), and the programmable
  `fill dir @d shape @s` and exclusive `fill paths @gen|expr` arming forms (`statements.ts`). Static path expressions remain AST expressions; reporter references participate in the all-paths-return analysis.
- **Index assignment**: `xs[i] = e`, `grid[i][j] += e` → `setindex`
  (`statements.ts:474-511`).
- Generic **builtin commands** (`BUILTIN_ARITY`), **list/gen commands**, and **user
  procedure calls** (`call`).

Block and header helpers:

- `parseBracketBlock` (`statements.ts:34`) — parses `[ … ]` statement blocks.
- `parseHeaderExpr` (`statements.ts:51`) — parses a loop/if header with `headerCtx`
  set, so a glued index that accidentally swallowed the block `[` yields the "add a
  space before the block" hint instead of a confusing parse error.
- `parseHeaderBlock` / `parseLoopBlock` (`statements.ts:62-76`) — the latter bumps
  `loopDepth` so `break`/`continue` are legal inside.

### 4.5 Command classification tables (`language/commands.ts`)

The parser is table-driven. `language/commands.ts` defines the name registries that the parser
and pre-scan consult:

| Table                      | Meaning                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `ALIASES`                  | surface name → canonical (`forward`→`fd`)                          |
| `BUILTIN_ARITY`            | Core builtin commands and their fixed arity                        |
| `BUILTIN_ARITY_OPT`        | commands taking one optional trailing arg (`stitchlen`, `filllen`) |
| `TRANSFORM_ARITY`          | CTM block commands (`translate`, `rotate`, …)                      |
| `EFFECT_ARITY`             | effect block commands with ranged arity                            |
| `QWORD_BUILTINS`           | commands taking a single quoted word, with allowed words           |
| `FUNC_ARITY`               | value-returning math functions and arity                           |
| `ZERO_FUNCS`               | zero-arg reporters (`xcor`, `heading`, …)                          |
| `LIST_FUNCS` / `LIST_CMDS` | list library (RFC-2), glued-call only                              |
| `GEN_FUNCS` / `GEN_CMDS`   | generative math plus call-only path commands                       |
| `QUERY_FUNCS`              | stitch-history query reporters                                     |
| `STRING_FUNCS`             | string library                                                     |
| `LIBRARY_FUNCS`            | union of the shadowable "Library tier" names                       |
| `CORE_COMMAND_NAMES`       | canonical Core commands gated by Monaco coverage tests             |
| `RESERVED`                 | "Core tier" words a user definition may **not** shadow             |

Quoted embroidery modes use a focused layer rather than repeating arrays in this table.
`embroidery/embroidery-registry.ts` owns the fabric, thread, stabilizer, and topping profiles plus satin/fill
underlay mode registries, while
`embroidery/fill-profile.ts` and `embroidery/satin-profile.ts` own construction choices such as
`satinwide 'warn'|'split'`;
`QWORD_BUILTINS` is a compatibility view consumed by parser classification. `core/mode-registry.ts`
provides literal-preserving registry helpers, case-insensitive resolution, and the shared
unknown-mode/did-you-mean diagnostic. Monaco snippets import the same registries, and catalog
tests require every registered mode to remain documented.

Two tiers govern name shadowing:

- **Core tier** (`RESERVED`, `language/commands.ts:367`): hard error if redefined.
- **Library tier** (`LIBRARY_FUNCS`, `language/commands.ts:357`): may be shadowed by a user
  procedure, emitting a one-time note via `noteLibraryShadow`.

The Library-tier builtins use **soft reservation**: their names are _not_ in
`RESERVED`, so variables and parameters may reuse them freely. Most Library builtins
are call-only; zero-argument reporters additionally resolve as bare values only when
no same-named variable or zero-argument user reporter exists. User procedures shadow
them at call sites, with the usual one-time note. This keeps every pre-RFC program
running unchanged.

`satinbetween` is the one Core call-only entry in `GEN_CMDS`: that table supplies its ranged call arity (2–4), while its explicit `RESERVED` entry keeps bindings and definitions illegal. Like every statement-only command, `@satinbetween` is rejected.

`stitchscope`, `atomic`, and `routegroup` are special Core block forms rather than arity-table
commands. They are listed explicitly in both `CORE_COMMAND_NAMES` (so Monaco
completion/hover/signature coverage is mandatory) and `RESERVED` (so bindings and definitions cannot
shadow them).

### 4.6 Static analysis (`analysis.ts`)

After the full program is parsed, `parseProgram` performs a parse-time
**reporter-path check** (`index.ts:42-65`, RFC DX item 6):

1. `collectValueUses(stmts, out)` (`analysis.ts:15`) walks the AST and records every
   procedure name used in a value-producing position — either a `callexpr` (called in
   expression context) or a `procref` (`@name` passed to `satin`/`fill`/`warp`).
2. For each such procedure, `allPathsReturn(body)` (`analysis.ts:143`) verifies that
   every control-flow path reaches a valued `return`/`output`.

`stmtAlwaysReturns` (`analysis.ts:128`) is conservative: a valued `output` always
returns; an `if` covers only if it has a final `else` and both branches always return;
an unconditional `stitchscope`, `atomic`, or `routegroup` covers when its body covers;
and a `return` reachable only inside a loop body does **not** count (the loop may run
zero times), matching the engine's runtime semantics. This rejects strictly fewer
programs than the runtime would — anything it flags would have thrown "never reached
output/return" at runtime anyway — but surfaces the error immediately, independent of
which random seed is used.

---

## 5. Error handling and diagnostics

All parse-time failures throw `NeedlescriptError` (`core/errors.ts:3`), which optionally
carries a source `line` appended to the message as `(line N)` and exposed via
`slLine`.

The parser prioritizes actionable, human-readable diagnostics over terse ones:

- **"Did you mean?"** suggestions come from `core/suggestions.ts`, a bounded (≤2 edits)
  Levenshtein implementation. `didYouMeanKinded` (`core/suggestions.ts:45`) weaves the
  candidate's kind into the message ("did you mean the command `stitchlen`?"), using
  the `nameCandidates()` map from the context.
- **Glued-bracket hints**: when a header index consumes the block-opening `[`, the
  error points at the missing space (`headerIndexHint`, `index.ts:133`;
  `parseHeaderBlock`, `statements.ts:62`).
- **Kind-aware rejections**: using a command where a value is expected, a variable as
  a procedure, or `@` on a statement-only builtin each produce a specific message.
- **Non-fatal notes** are collected into the optional `notes` array passed to
  `parse()` (used for library-shadow notices), surfaced to the user as warnings by the
  interpreter (`runtime/index.ts:35`).

---

## 6. Output: the AST

The parser emits `ASTNode[]`. The node union is defined in `core/types.ts:110-152`.

**Statement nodes** (`ASTNode`) include: `to`, `repeat`, `while`, `for`, `forin`,
`if`, `transform`, `effect`, `make`, `local`, `letlist`, `setindex`, `output`,
`break`, `continue`, `stitchscope`, `atomic`, `routegroup`, `cmd`, `listcmd`, `fillarm`, `call`.

**Expression nodes** (`ExprNode`) include: `num`, `str`, `var`, `neg`, `bin`, `func`,
`listfunc`, `list`, `index`, `callval`, `callexpr`, `procref`, `trace`.

Because both classic and modern syntaxes lower onto this same node set, the downstream
consumers — the interpreter (`runtime/`), the stitch machine (`embroidery/machine/`), and the
exporters (`svg.ts`, `dst.ts`, `pes.ts`, `exp.ts`) — are agnostic to surface syntax.

---

## 7. Related but separate: `editor/parameters.ts`

`editor/parameters.ts` is **not** part of the language parser. It is a lightweight,
comment-annotation scanner that reads OpenSCAD-style `// [min:max]` annotations on
`let`/`make` declarations to drive the playground's parameters-panel UI. It shares no
code path with `tokenize`/`prescan`/`parse` and does not produce an AST. It is noted
here only to avoid confusion with the language front-end.

It also recognizes color-specific `[color]` and `[palette]` annotations. The language
directives `palette` and `background` themselves use the ordinary `cmd` AST node and
expression parser; color literals remain strings, so the tokenizer and AST value union
need no color-specific token or node.

---

## 8. File reference

| File                                | Responsibility                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `language/tokenizer.ts`             | `tokenize()` — source → `Token[]`                                                 |
| `language/closure-lowering.ts`      | anonymous-def scope analysis, capture checks, and lambda lifting                  |
| `language/prescan.ts`               | `prescan()` — token stream → `PreScan` (names, arity, scopes)                     |
| `language/module-linker.ts`         | import/export extraction, std resolution, qualification, AST linking              |
| `language/standard-library/`        | bundled NeedleScript source modules and pure module registry                      |
| `language/parser/index.ts`          | `parse()` entry, `ParseContext` construction, top-level loop, reporter-path check |
| `language/parser/context.ts`        | `ParseContext` interface (shared state + helpers)                                 |
| `language/parser/expressions.ts`    | precedence ladder, primaries, argument lists, postfix chains                      |
| `language/parser/statements.ts`     | statement dispatcher, blocks, headers                                             |
| `language/parser/analysis.ts`       | static control-flow analysis for reporter paths                                   |
| `language/commands.ts`              | name/arity/reservation tables driving parser dispatch                             |
| `embroidery/embroidery-registry.ts` | fabric profiles and focused embroidery mode registries                            |
| `core/mode-registry.ts`             | typed mode keys, case-insensitive resolution, standard diagnostics                |
| `core/suggestions.ts`               | bounded edit-distance "did you mean?" helper                                      |
| `core/errors.ts`                    | `NeedlescriptError`                                                               |
| `core/types.ts`                     | `Token`, `TokenType`, `ASTNode`, `ExprNode` and related types                     |

Tests covering the front-end live in `src/lib/__tests__/` — notably
`tokenizer.test.ts`, `parser.test.ts`, `modern-syntax.test.ts`, and `language.test.ts`.
