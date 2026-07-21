# NeedleScript Interpreter Architecture

NeedleScript is a Logo-inspired language for generative embroidery. This document
describes the **interpreter** — the tree-walking evaluator that executes the AST
produced by the parser (see `needlescript-parser-architecture.md`) and drives the
stitch machine to produce embroidery output. It covers the module layout, the shared
runtime context, statement/expression evaluation, procedure calls, control-flow
signals, resource budgets, the value model, the programmable-reporter machinery, and
how a run is finalized into a `RunResult`.

Like the rest of `src/lib/`, the interpreter is platform-neutral: no DOM APIs, no UI
concerns. It is part of the publishable core.

---

## 1. Where the interpreter sits

```
source ──tokenize──► Token[] ──link/parse──► ASTNode[] ──run()──► RunResult
                                                    │
                                       ┌────────────┴────────────┐
                                       │   runtime/  +  Machine │
                                       └───────────────────────────┘
```

The implementation entry point is `run(source, opts)` in `runtime/index.ts:30`; the
stable public surface re-exports it from `engine.ts`.

`run` performs the full pipeline in one call:

```ts
const tokens = tokenize(source); // lex
const program = linkStandardModules(tokens, parseNotes); // modules + parse (+ pre-scan)
const m = new Machine(); // side-effect target
// … build RunContext, wire modules, execute, finalize …
```

Module linking is entirely compile-time. Imported standard-library procedures are parsed
from bundled NeedleScript source, qualified to collision-free internal names, and prepended
as ordinary `to` nodes. The runtime has no module loader and does not distinguish imported
procedures from local ones; importing consumes no operations or random draws beyond the
normal definition registration and calls the program actually makes. Module loading itself
never touches the RNG or stitch machine.

The promoted `std.pathops.dashes as dashes` compatibility import resolves directly to the
ranged-arity builtin. This preserves old three-argument sources while allowing the optional
fourth dash-phase argument without adding optional procedure parameters to the grammar.

For profiling, `RunOptions.onTiming` receives the elapsed time for root tokenization,
module linking/parsing (including module tokenization and pre-scan), execution/finalization, and
physics analysis, plus diagnostic counts at the selected analysis breadth. The callback is optional
and synchronous, so normal library results and deterministic language behavior are unchanged. The
playground worker adds statistics, worker-total, and message round-trip timings in
`CompileResponse.timings`.

`RunOptions.machineProfile` is another non-source input. It is a serializable local machine
profile resolved and validated by `embroidery/machine-profile.ts`; it never enters the AST, globals, share URL,
or source text. The resolved identity/default or caller profile is returned in
`RunResult.machineProfile` and reused by structured preflight.

`RunOptions.physicsAnalysis` is a caller-only analysis selector. Its default, `'preflight'`, retains
the library's compatibility behavior by analyzing the checks selected by source policy; `'full'`
requests all existing event-stream and construction checks without modifying that policy. The
playground worker opts into `'full'`, while book, staging, and direct-library callers retain the
default unless they request otherwise.

The interpreter is a **tree-walker**: it recursively evaluates `ASTNode`/`ExprNode`
values directly, with no bytecode or intermediate compilation step. CPU-heavy runs are
kept off the UI thread by running the whole compiler/interpreter in a Web Worker at the
app layer (`src/compiler.worker.ts`), but the interpreter itself is a plain synchronous
function. `useCompiler` shares one worker across playground/book consumers and serializes
jobs; stale queued work is discarded, and the execution timeout starts only when a job
reaches the worker.

---

## 2. Module layout (`runtime/`)

The interpreter is split into focused modules that all share one mutable `RunContext`
object:

```
runtime/
├── index.ts        run() — orchestration, context construction, module wiring, finalize
├── context.ts      RunContext interface: all mutable state + function slots
├── signals.ts      ReturnSignal, LoopSignal (non-error control-flow unwinding)
├── budget.ts       resource metering: tick/charge/allocList/allocString + trace notes
├── guards.ts       value guards: truthy, toIndex, list, funcRef, checkDepth
├── eval-expr.ts    expression evaluator (ExprNode → Val)
├── exec-stmt.ts    statement/block executor (ASTNode side effects)
├── exec-cmd.ts     the large `cmd` dispatcher (turtle + machine directives)
├── proc-call.ts    procedure calls, scalar builtins, @ref invocation
├── reporters.ts    @name reporter contracts (warp/satin/fill/stitchlen/filllen)
├── list-func.ts    list library (RFC-2): range, map, filter, reduce, …
├── gen-func.ts     generative math: noise, editable curves, path queries, generators, open geometry, …
├── query-func.ts   stitch-history queries (coverat, nearestsewn, …)
└── string-func.ts  string library: str, num, split, joinstr, upper, …
```

The value model those modules operate on lives alongside them in `runtime/list.ts`.

Travel routing deliberately lives outside the evaluator modules. `embroidery/routing.ts` owns the
generic deterministic algorithm registry, spatial-bucket nearest implementation, and bounded
nearest-plus-2-opt improvement;
`embroidery/travel-planner.ts` adapts final `StitchEvent` runs to that interface. `gen-func.ts`
adapts NeedleScript point/path values to the same interface for `routesort`. This
keeps future algorithms additive: implement one `RouteAlgorithm`, register it, then
map a language mode to it without duplicating spatial search or tie semantics.

---

## 3. The `RunContext` pattern

Rather than a class hierarchy, the interpreter uses a single plain object,
`RunContext` (`context.ts:14-132`), that carries **all** mutable state _and_ every
cross-module function as a property slot. Every module receives `ctx` and both reads
state from it and installs its functions onto it.

### 3.1 Mutable state (`context.ts:15-33`)

| Field                 | Purpose                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `globals`             | top-level variable bindings (`Record<string, Val>`)                                                                |
| `globalLines`         | first assignment/declaration line for each global, used by the Data inspector                                      |
| `chalk`               | preview-only affine-mapped snapshots plus their raw event-stream anchors                                           |
| `chalkVertices`       | run-total vertex counter for the dedicated preview budget                                                          |
| `procs`               | procedure name → its `to` AST node (populated as `to` statements execute)                                          |
| `rng`                 | main PRNG stream; reassigned by `seed`                                                                             |
| `noise`               | legacy coherent noise; reassigned by `seed`                                                                        |
| `snoise2/snoise3`     | seeded simplex noise streams                                                                                       |
| `ops`                 | operation counter (the anti-infinite-loop budget)                                                                  |
| `cells`               | live list-cell counter                                                                                             |
| `stringChars`         | cumulative string-char allocation counter                                                                          |
| `printed`             | accumulated `print`/`printloc` output                                                                              |
| `insideTrace`         | trace-sandbox nesting depth                                                                                        |
| `traceNoted`          | one-time notes already emitted inside trace                                                                        |
| `structuralDepth`     | structural block nesting (loop/if/stitchscope/atomic/routegroup/transform/effect) — for directive placement guards |
| `preflightMode/Line`  | selected post-run diagnostic policy (`off`/`warn`/`strict`) and directive source line                              |
| `planMode/planLine`   | selected post-run travel strategy and its source line                                                              |
| `planBarrierOffsets`  | sparse authored event offsets recorded by active `planbarrier` commands                                            |
| `planAtomicSpans`     | sparse outermost `[start,end)` event spans recorded by active `atomic` blocks                                      |
| `atomicDepth`         | runtime nesting depth; only depth zero owns and records a span                                                     |
| `planRouteGroupSpans` | sparse outermost `[start,end)` spans recorded by active `routegroup` blocks                                        |
| `routeGroupDepth`     | runtime nesting depth; only depth zero owns and records a group                                                    |
| `m`                   | the `Machine` — the side-effect target                                                                             |

### 3.2 Function slots and init ordering

The remaining `RunContext` fields are function references, grouped by owner module
(`budget`, `guards`, dispatchers, `evalExpr`, `execStmt`/`execBlock`, `callProc`,
`reporters`). They are populated by `init*` helpers in `run()`
(`index.ts:70-79`):

```ts
initBudget(ctx);
initGuards(ctx);
initStringFunc(ctx);
initListFunc(ctx);
initGenFunc(ctx);
initQueryFunc(ctx);
initProcCall(ctx); // needs evalExpr + execBlock at RUNTIME (lazy via ctx)
initReporters(ctx);
initEvalExpr(ctx); // needs callProc + execBlock at RUNTIME (lazy via ctx)
initExecStmt(ctx); // needs evalExpr + callProc at RUNTIME (lazy via ctx)
```

**Order matters only for slot existence, not calls.** Each `init*` assigns closures
that reference _other_ `ctx.*` slots, but those references fire at execution time, not
at init time — so the mutual recursion between `evalExpr`, `execStmt`, `callProc`, and
the dispatchers is resolved through the shared `ctx` object. This is the same
"function-slots-on-a-shared-object" technique the parser uses to break circular
imports, applied here for a graph of mutually recursive evaluators.

Execution then begins with a single call (`index.ts:82`):

```ts
ctx.execBlock(program, null, 0, 0);
```

The four arguments — `stmts, env, repcount, depth` — thread through nearly every
evaluator function.

---

## 4. The value model (`runtime/list.ts`)

Runtime values are the union `Val = number | string | NsList | FuncRef`
(`runtime/list.ts:17`):

- **`number`** — the only scalar; booleans do not exist (`true`/`false` lex to `1`/`0`,
  comparisons return `1`/`0`).
- **`string`** — immutable value type; copy is identity, index assignment is always an
  error (`exec-stmt.ts:107`).
- **`NsList`** (`runtime/list.ts:19-27`) — a class wrapping `items: Val[]`. `instanceof` is the
  type tag; identity is reference identity (Python-like: mutable, reference semantics,
  explicit `copy()`).
- **`FuncRef`** (`runtime/list.ts`) — a reference to a procedure or builtin produced by
  `@name`, carrying a declared arity range plus an immutable tuple of leading bound
  values. Plain references have an empty tuple; `bind` and lambda-lifted closures
  populate it. `ComposedRef` extends it for `compose(@f, @g, …)` pipelines.

References are first-class list elements and callable values. Equality involving a
reference is deliberately an error. Formatting exposes the effective arity and bound
slot count; final top-level references are also serialized into `referenceVars` for
the playground Data inspector.

`runtime/list.ts` also provides the shared value utilities the interpreter leans on
everywhere:

| Helper                              | Role                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `num(v, what, line, side)`          | guard: value must be a number, else a named type error (`runtime/list.ts:115`)  |
| `isList` / `isFuncRef` / `isString` | type predicates                                                                 |
| `describeVal`                       | human phrasing for error messages ("a list (length 3)")                         |
| `formatNum` / `formatVal`           | canonical display for `print` and list rendering                                |
| `deepEqual`                         | structural equality with a `1e-9` numeric tolerance (`runtime/list.ts:141`)     |
| `deepCopy`                          | deep clone with a per-cell callback for budget charging (`runtime/list.ts:173`) |
| `valDepth` / `cellCount`            | depth/size measures, all capped at `LIMITS.maxListDepth`                        |

Every deep walk is depth-capped so a cycle created through mutation becomes a loud
error rather than a hang — the project's "loud beats convenient" rule.

---

## 5. Statement execution (`exec-stmt.ts`)

`initExecStmt` installs three functions:

- **`execBlock`** (`exec-stmt.ts:26`) — runs a statement list in order.
- **`runLoopBody`** (`exec-stmt.ts:40`) — runs one loop iteration, catching
  `LoopSignal`: returns `false` on `break` (stop the loop), `true` otherwise (including
  `continue`). This is how RFC-4 loop control is implemented.
- **`execStmt`** (`exec-stmt.ts:56`) — the per-statement dispatcher.

`execStmt` charges one op via `ctx.tick(st.line)` on entry, then switches on `st.k`:

| Node kind                            | Behavior                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `to`                                 | registers the procedure into `ctx.procs` (definitions are hoisted at execution)                                                                                    |
| `make` / `local`                     | assign a global / local binding                                                                                                                                    |
| `letlist`                            | destructuring assignment `let [x, y] = …` with arity checks                                                                                                        |
| `setindex`                           | lvalue index chains `xs[i] = v`, `grid[i][j] += v` (strings rejected)                                                                                              |
| `repeat` / `while` / `for` / `forin` | loops, each bumping `structuralDepth` and using `runLoopBody`; `for` and `forin` save/restore the loop variable's prior binding                                    |
| `if`                                 | conditional with optional `elseBody`                                                                                                                               |
| `stitchscope`                        | snapshots construction configuration, executes its body, and restores in `finally` through all control transfers and errors                                        |
| `atomic`                             | executes with exception-safe nesting; active planning flushes/records only the outermost span, while planning off is a construction no-op wrapper                  |
| `routegroup`                         | records an exception-safe outermost eligibility span; when groups exist, ungrouped records bypass routing in authored order                                        |
| `transform`                          | composes a CTM matrix onto the machine's stack for the block's duration; `flushSatin` on both edges                                                                |
| `effect`                             | `warp`/`humanize`/`snaptogrid`/`declump` — pushes an effect onto the machine's pen/warp stack for the block                                                        |
| `output`                             | throws `ReturnSignal` (guarded: only inside a procedure, `depth > 0`)                                                                                              |
| `break` / `continue`                 | throw `LoopSignal`                                                                                                                                                 |
| `call`                               | invoke a user procedure for its side effects                                                                                                                       |
| `fillarm`                            | arm a programmable field fill or custom reporter/static path fill for the next `beginfill…endfill`; validate/freeze path data and install the no-emission callback |
| `listcmd`                            | list/path commands (`append`, `insertat`, `setpos`, `sewpath`, `satinbetween`, …)                                                                                  |
| `cmd`                                | delegates to the `execCmd` handler (below), with `assert` handled inline for lazy message evaluation                                                               |

Loops enforce `ctx.m.effectiveLimits.maxLoopIters` up front, and `while` calls
`ctx.tick` each iteration so a non-terminating loop hits the op budget.

The quoted `underlay` and `fillunderlay` commands retain legacy selectors until the relevant
generator knows the physical width or region area, then lower to ordered typed profiles.
`fabric` presets explicitly provide satin mode, fill mode, and doubled-pass policy rather than
relying on implicit dispatcher defaults. Lowering and validation are pure functions in
`embroidery/underlay-profile.ts`; they require neither interpreter context nor program execution.

`underlaypasses` validates a list of up to 16 case-insensitive pass names before touching machine
state. The numeric `underlaylen`, `underlayinset`, and `underlayspacing` commands use the centralized
profile ranges and reject rather than clamp invalid values. Once validated, each command flushes a
pending satin column under its old settings and replaces the immutable customization record. The
record is copied by construction and trace snapshots; `underlay` and `fabric` clear it to restore a
complete legacy/preset profile.

`fillunderlaypasses` applies the same validation model to up to 16 case-insensitive `edge`/`tatami`
names; duplicates and an empty list are meaningful. `fillunderlaylen`, `fillunderlayinset`, and
`fillunderlayspacing` reject values outside the centralized physical ranges, while
`fillunderlayangle` accepts any finite relative degree value. The commands replace an immutable
`FillUnderlayCustomization` without causing fill emission; `endfill` resolves it after the physical
compound region is known. `fillunderlay` and `fabric` clear the record. Construction and trace
snapshots clone the pass list, so `stitchscope` and trace restoration retain value semantics.

Material intent lives on the machine as one immutable-by-replacement `MaterialIntent` record.
`fabric` selects the richer `FABRIC_PROFILES` entry while continuing to lower its exact legacy
construction view through the compatible `FABRICS` export. `threadprofile` resolves a generic
rayon/polyester weight and resets its width default; `threadwidth`, `fabricgrain`, `fabricstretch`,
`needle`, `stabilizer`, and `topping` then replace only their resolved metadata fields. This makes
profile/default precedence ordinary source order. Directional fabric defaults remain neutral and
none of the material commands feeds geometry. Beginning in Session 7.2, `threadprofile` and
`threadwidth` synchronize the live `DensityGrid` width; other new fields remain metadata-only.

Both construction and trace snapshots copy the material record. `stitchscope` therefore restores
outer material intent with its other sticky construction settings, and material commands evaluated
inside `trace` cannot leak. Restoring either snapshot also resynchronizes the coverage-grid width.
Finalization copies the resolved record to `RunResult.material`.

`DensityGrid` accumulates raw per-cell thread length and applies its current resolved width to every
`coverat`/`coverAvg` read and to finalization. A late thread-width change therefore reinterprets both
committed and later length consistently instead of mixing widths in one result. The finalized
`DensityResult.threadWidthMM` reports that width. The default remains 0.4 mm, and `maxdensity`
continues to be the exact authored layer threshold rather than being profile-scaled.

### 5.1 The command dispatcher (`exec-cmd.ts`)

`initExecCmdHandler` (`exec-cmd.ts:23`) returns the `execCmd` closure used by the
`'cmd'` branch. It is the largest single dispatcher and handles all the "directive"
and turtle commands:

- **Output-mode-sensitive commands checked first**: `print`/`printloc`, the
  reporter/list forms of `satin`, `stitchlen`, `filllen`, and the string-mode commands
  `fabric`/`threadprofile`/`stabilizer`/`underlay`/`fillunderlay` — all before the bulk `num()` conversion, because
  their arguments are not plain scalars.
- **Program directives** `hoop` and `override` (`exec-cmd.ts:171`, `249`) — guarded to
  the top level: not inside a loop/if/procedure (`structuralDepth > 0 || depth > 0`),
  not inside `trace`, and before the first stitch. `override` mutates
  `ctx.m.effectiveLimits[budgetKey]` within `OVERRIDE_FLOORS`/`OVERRIDE_CEILINGS`. `hoop`
  accepts presets, a circular diameter, rectangular dimensions, or dimensions plus an explicit
  `circle`/`oval`/`rectangle` shape; shape names use the shared case-insensitive mode resolver.
- **`mark`** — records a labelled position marker.
- **`chalk`** — validates point/path/group data through `chalk.ts`, snapshots and
  affine-maps it without touching machine output, RNG, turtle, satin, or history.
- **Scalar turtle/machine commands** — the final `switch` after
  `vals.map(v => num(...))`: `fd`, `bk`, `rt`, `lt`, `up`, `down`, `home`, `setxy`,
  `arc`, `moveto`, `circle`, `push`/`pop`, plus the embroidery-parameter setters
  (`stitchlen`, `density`, `fillspacing`, material metadata, `lock`, `bean`, `color`, `trim`, `seed`, …).
  Values are clamped to machine-safe ranges with warnings when clamped.

The satin construction string dispatch also handles `satinwide 'warn'|'split'` through the shared
registry. `satinmaxwidth` and `satinsplitoverlap` validate against centralized physical ranges
before flushing a pending column and changing the sticky setting. All three values participate in
construction and trace snapshots, so `stitchscope` restores them and trace evaluation cannot leak
them.

Most parameter commands emit a **trace note** via `ctx.traceNote` if used inside a
`trace` block, where they have no effect on the captured path.

`stitchscope` increments `structuralDepth`, so top-level-only directives remain
illegal inside it. Its machine restore runs from `finally`, after inner transform/effect
cleanups during non-local unwinding. Color, turtle, RNG, variables, output, history,
and directive state are deliberately outside the construction snapshot and therefore
remain changed after the block.

`atomic` also increments `structuralDepth` and unwinds `atomicDepth` in `finally`. With active
planning, the outermost block flushes pending satin/reporter-running construction at both edges and
records one sparse event span. Nested blocks share that owner. With planning absent or `off`, neither
edge flushes and no span is stored. Trace use and fill-boundary crossings are rejected; an active
`planbarrier` inside the block is rejected before it can split the span.

`routegroup` follows the same planning-off identity and exception-safe outermost-owner discipline.
Active boundaries flush pending construction and record one sparse span. Groups may contain atomics,
color changes, and barriers; finalization intersects those constraints. A group cannot begin inside
an atomic, run in trace, or cross an open fill boundary.

---

## 6. Expression evaluation (`eval-expr.ts`)

`initEvalExpr` installs `ctx.evalExpr(node, env, repcount, depth): Val`
(`eval-expr.ts:12`). It ticks the op budget then switches on `node.k`:

| Expr kind     | Behavior                                                                             |
| ------------- | ------------------------------------------------------------------------------------ |
| `num` / `str` | literal (strings checked against `maxStringLength`)                                  |
| `var`         | local (`env`) → global lookup; a missing `bare` var is "never assigned on this path" |
| `neg`         | numeric negation                                                                     |
| `list`        | evaluate items, allocate an `NsList` (depth-capped)                                  |
| `index`       | index into a list or string (`toIndex` handles negatives + bounds)                   |
| `callval`     | evaluate a computed target; references route through `callRef`, other values error   |
| `listfunc`    | routes to `genFunc` / `queryFunc` / `listFunc` by name-table membership              |
| `bin`         | binary operators                                                                     |
| `func`        | scalar builtins, with `repcount` special-cased to the loop counter                   |
| `callexpr`    | call a user procedure _as a reporter_; error if it never `output`s                   |
| `procref`     | produce a `FuncRef`                                                                  |
| `trace`       | the trace sandbox (below)                                                            |

Notable semantics:

- **Short-circuit `and`/`or`** (`eval-expr.ts:93-102`) so guards like
  `:i > 0 and 10 / :i > 2` are safe.
- **Equality** (`=`/`!=`) uses `deepEqual` across all types; cross-type comparisons
  return `0`/`1` without error ("equality is a question").
- **Loud type errors with hints**: `+` on strings suggests `concat`; arithmetic on
  lists suggests the named vector functions (`vadd`, `vsub`, `vscale`) rather than
  silently broadcasting.
- **Division by zero** throws.

### 6.1 The trace sandbox (`eval-expr.ts:188-241`)

`trace [ … ]` / `tracerings [ … ]` capture turtle motion as path data instead of
sewing it. The evaluator snapshots the machine (`snapshotForTrace`), enters a clean
recording frame, executes the block, then restores everything except warnings/RNG/
variables. `ReturnSignal` and `LoopSignal` cannot cross the trace boundary (each is
converted to a clear error); real errors propagate. `trace` returns a single path;
`tracerings` returns a list of paths.

A nested `stitchscope` still takes and restores its construction-only snapshot in
`finally`. Construction setters keep their existing trace-note/inert-geometry behavior;
the enclosing trace snapshot remains the final authority on machine state.

---

## 7. Procedure calls and references (`proc-call.ts`)

`initProcCall` installs four functions:

- **`callProc`** (`proc-call.ts:17`) — call a user procedure from AST argument nodes.
  It checks the procedure exists and that `depth < maxCallDepth`, evaluates arguments
  into a fresh `Object.create(null)` environment bound to the parameters, and runs the
  body via `execBlock` at `depth + 1`. A `ReturnSignal` yields the return value;
  reaching the end yields `undefined` (meaning "no value"). Notably, it passes the
  **call-site line** as `contextLine` so stitches produced inside the procedure are
  stamped with the caller's source line.
- **`callProcVals`** (`proc-call.ts:52`) — same, but from already-evaluated values.
  Used by the reporter machinery (once per point/stitch).
- **`scalarBuiltin`** (`proc-call.ts:82`) — evaluates the `FUNC_ARITY`/`ZERO_FUNCS`
  math tier (`sin`, `sqrt`, `pow`, `log`, `mod`, `atan`, `distance`, `towards`, `xcor`,
  `heading`, …) on numeric values. `sqrt` and `log` enforce their real-number domains;
  `random`/`noise` draw from `ctx.rng`/`ctx.noise`.
- **`callRef`** (`proc-call.ts`) — validate the effective arity, prepend bound values,
  then invoke a `FuncRef`/`ComposedRef`. Resolution order is composed pipeline → user
  proc (shadows builtins) → scalar builtin → list/gen/query/string builtin. Every
  higher-order function and embroidery reporter consumer uses this path.
- **`bindRef` / `effectiveRefSignature` / `assertRefArity`** — shared configured-reference
  construction and ranged-arity validation. Binding all parameters is legal and creates
  a zero-argument reference; more than 16 bound slots is rejected.

---

## 8. Control flow via signals (`signals.ts`)

Non-local control flow is implemented with thrown sentinel objects (not `Error`
subclasses, so they never mix with real errors):

- **`ReturnSignal`** (`signals.ts:4`) — thrown by `output`/`op`/`return`/`exit`;
  caught in `callProc`/`callProcVals` to unwind to the enclosing call and surface the
  value.
- **`LoopSignal`** (`signals.ts:17`) — thrown by `break`/`continue`; caught in
  `runLoopBody`. Parse-time validation (the parser's `loopDepth` tracking) guarantees a
  loop catches it before any procedure boundary, so the catches in `callProc` and at
  the top level (`index.ts:85`) are purely defensive, converting a leaked signal into a
  clear error.

---

## 9. Resource budgets and guards

The interpreter is designed to run untrusted, generative code in a browser tab, so
every unbounded operation is metered.

### 9.1 Budget metering (`budget.ts`)

`initBudget` installs the metering primitives, all reading limits from
`ctx.m.effectiveLimits` (a mutable copy of `STOCK_LIMITS` that `override` can raise or
lower, `embroidery/machine/machine.ts:206`):

| Function                 | Charges                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `tick(line)`             | +1 op; throws `overlongMsg()` past `maxOps` (`budget.ts:28`) |
| `tickN(n, line)`         | +n ops                                                       |
| `charge(n, line)`        | +n list cells (`maxListCells`) then +n ops                   |
| `allocString(s, line)`   | per-string `maxStringLength` + cumulative `maxStringChars`   |
| `allocList(items, line)` | `maxListLen` + charges cells                                 |
| `traceNote(kind, msg)`   | one-time warning when a no-op command runs inside `trace`    |

`overlongMsg` (`budget.ts:15`) tailors the "ran too long" message — noting if the op
limit was raised by `override`, and if stitch-history queries were used (a likely
non-terminating feedback loop). The relevant budget keys are defined in
`embroidery/machine/limits.ts` (`STOCK_LIMITS`, `OVERRIDE_CEILINGS`, `OVERRIDE_FLOORS`), and stitch
count itself is enforced inside the `Machine`.

### 9.2 Value guards (`guards.ts`)

`initGuards` installs type/range guards that produce actionable errors:

- **`truthy(v, what, line)`** — a condition must be a number; lists and strings are
  loud errors with hints (`len(xs) > 0`).
- **`toIndex(v, len, what, line)`** — index must be integral within `1e-9`; negatives
  count from the end; out-of-range is an error.
- **`list(v, …)`** / **`funcRef(v, …)`** — assert list / procedure-reference types.
- **`checkDepth(v, line)`** — reject nesting a value past `LIMITS.maxListDepth`.

String-valued construction modes are resolved separately through `core/mode-registry.ts`.
`exec-cmd.ts` reads the focused registries from `embroidery/embroidery-registry.ts`, `embroidery/fill-profile.ts`, and
`embroidery/satin-profile.ts`, matches values
case-insensitively while retaining their literal TypeScript union, and uses one standard
unknown-mode message with choices and did-you-mean text. Travel planning exposes `PLAN_MODES`
from its strategy registry for the same validation path. These registries are also consumed by
Monaco metadata, so runtime and editor choices cannot drift independently.

---

## 10. Built-in library dispatchers

Four modules install one dispatcher each; `evalExpr`'s `listfunc` branch and
`callRef` route to them by name-table membership (`LIST_FUNCS`, `GEN_FUNCS`,
`QUERY_FUNCS`, `STRING_FUNCS` from `language/commands.ts`):

- **`list-func.ts`** — RFC-2 list library: `range`, `filled`, `len`, `first`/`last`,
  `concat`, `slice`, `sort`, `map`/`filter`/`reduce`, `compose`, `pick`/`shuffle`
  (seeded via `fork`), etc. Allocations go through `ctx.allocList`/`ctx.charge`.
- **`gen-func.ts`** — RFC-3 generative math: scalar helpers (`lerp`, `clamp`,
  `smoothstep`), simplex noise, vector/segment ops, path/curve ops (`resample`,
  `chaikin`, `bezier`), generators (`scatter`, `voronoi`, `triangulate`, `hull`,
  `relax`), geometry ops (`offsetpath`, `clippaths`), and the pure path transforms. It
  bridges to `geometry/affine.ts`, `geometry/genmath.ts`, `geometry/geometry.ts`, `geometry/generators.ts`, and
  `embroidery/hoop-presets.ts`. When a generator uses the implicit hoop field it sets
  `ctx.m.fieldLocked` so a later `hoop` directive errors clearly.
- **Rail-pair surface** — `satinbetween` runs from the `listcmd` branch because its operands are runtime lists. The interpreter validates paths, checkpoints, reporter contracts, and the geometry-input budget before one atomic machine call. `railinset`, `railrake`, and `railspine` live in `gen-func.ts`; `railspine` shares the pure builder in `geometry/rail-pair.ts`.
- **`query-func.ts`** — closed-loop stitch-history reporters (`coverat`, `countat`,
  `nearestsewn`, `sewnwithin`, `stitchedpoints`). They set `ctx.m.usedQuery`, map local
  points through the CTM to hoop space, and read the machine's coverage grid. Costs are
  charged proportional to the query radius.
- **`string-func.ts`** — string library (`str`, `num`, `split`, `joinstr`, `upper`,
  `lower`, `strip`, `chars`, `repeatstr`), ASCII-only case, results routed through
  `allocString`.

---

## 11. Programmable reporters (`reporters.ts`)

`initReporters` installs the machinery that runs _user code per emitted primitive_ —
the mechanism behind the language's programmable effects. Each reporter kind has a
two-part contract: an **arity check** at the engage site and a **per-call validation**:

| Reporter                 | Contract                                                                | Used by                      |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------- |
| `applyReporter`          | 1 param `[x, y]` → point                                                | `warp @fn` (once per vertex) |
| `applyShapeReporter`     | 4 params `(t, s, i, u)` → `[advance, leftw, rightw, leftlag, rightlag]` | `satin @fn`                  |
| `applyStitchLenReporter` | 4 params `(t, s, i, p)` → advance mm                                    | `stitchlen @fn`              |
| `applyFillLenReporter`   | 4 params `(t, s, i, p)` → advance mm                                    | `filllen @fn`                |
| `applyFillDir`           | 1 param `[x, y]` → heading                                              | `fill dir @fn`               |
| `applyFillShape`         | 3 params `(p, row, v)` → `[spacing, len, phase]`                        | `fill shape @fn`             |

Each validates the reference's effective parameter count at engagement, invokes it
through `callRef`, and validates the returned shape — with errors that name exactly
which slot went wrong. `reporters.ts` also holds the `clampHumanize`/`clampMaxshift` range clamps for
the `humanize`/`declump` effects.

These reporters are installed onto the `Machine` (e.g. `ctx.m.satinReporter`,
`ctx.m.fillDirReporter`) so the machine can invoke them at the exact moment it lays a
stitch pair or a fill row.

---

## 12. The Machine boundary

The interpreter never emits stitches directly. It computes values and control flow,
then calls methods on `ctx.m` (the `Machine` from `embroidery/machine/`) — `forward`, `arc`,
`setXY`, `beginFill`/`endFill`, `pushTransform`/`popOut`, `flushSatin`, `markHere`,
`colorChange`, `snapshotConstructionConfig`/`restoreConstructionConfig`, etc. The `Machine` owns:

- turtle state (position, heading, pen), the CTM/effect stacks, and satin/fill buffering;
- the coverage/density grid the query reporters read;
- `effectiveLimits` and the stitch-count budget;
- the accumulated `events: StitchEvent[]`, `warnings`, and hoop/override state.

This separation keeps `src/lib/` layered: the interpreter is language semantics; the
Machine is embroidery physics and event accumulation.

---

## 13. Finalizing a run (`index.ts:82-260`)

After `execBlock` returns, `run` performs post-processing and assembles the result:

1. **Flush and close**: `m.flushSatin()`; if a fill was left open, close it with a
   warning (`index.ts:90-95`).
2. **Tiny-stitch merge warnings**, then optional **local calibration** and **travel planning**. A
   supplied `RunOptions.machineProfile` is validated before source execution; after execution its
   bounded affine correction is applied to a copied event stream plus explicit construction regions,
   rail sections, connector endpoints, and existing warning points. Event identity is remapped so
   construction order checks remain exact. Identity correction bypasses this pass. Planning sees
   the closed raw event stream, lowers it to private event-plus-tag wrappers, and runs before every
   order-sensitive pass. Sparse `planbarrier` offsets become segment tags and outermost `atomic`
   spans become atomic IDs, and route-group spans become eligibility IDs during this lowering. Trims
   and autotrim-sized jumps inside one atomic ID no longer split route items, and those items never
   expose reverse endpoints. With no groups the compatibility whole-design route remains; with any
   groups, untagged records are copied in authored order and each tagged color/segment intersection
   routes independently. Group routes use stable nearest ordering followed by bounded 2-opt (32-item
   window, 4,096 candidates, at most eight accepted passes). Every examined distance charges the
   operation budget. Because the current representation cannot move one item across independently
   routed color blocks, an atomic span containing a color event errors with its source line. Planning
   unwraps to plain `StitchEvent[]` before returning. After planning, corrected movements beyond the
   hard 12 mm ceiling are deterministically re-split before auto-trim.
3. **Auto-trim**, then **density analysis** with the resolved thread width before locks (so tie-offs don't read as false hotspots), then
   density/stack hotspot warnings with `WarningLocation` spatial data
   (`index.ts:121-153`).
4. **Lock (tie-off) pass** via `applyLocks` (`index.ts:155-160`).
5. **Hoop-overflow warnings** for stitches outside the sewable field / physical hoop. With active
   calibration these are recomputed from corrected pre-lock penetrations, replacing authored-space
   overflow hits; only corrected coordinates determine final field validity.
6. **Override-raise warnings** — one per raised budget, emitted every run
   (`index.ts:206-241`).
7. **Finalize preview data**: translate each chalk command's raw event-stream offset
   to the stitch/jump playback index, and classify/snapshot chalkable final globals.
8. **Assemble structured preflight and physics diagnostics** (`embroidery/preflight.ts`,
   `embroidery/physics-diagnostics/`): the pure preflight adapter sorts locatable diagnostic
   sidecars by their legacy warning index, maps them through the central catalog to stable
   codes/severities/suggestions, copies
   deterministic hoop-space points and source lines, then, when `preflight 'warn'` or `'strict'` is
   active, appends the fixed-order results from the pure event-stream and construction analyzers and
   counts severities. With no directive or `preflight 'off'`, only the structured counterparts to
   legacy always-on diagnostics remain. Explicit local trim/color-change capability mismatches are
   included regardless of extended-check mode because they describe the selected machine rather than
   a subjective construction recommendation. Event-stream analysis sees planned/autotrimmed
   events before `applyLocks`, excluding deliberate tie-off micro-stitches. It does not mutate the
   completed events or the legacy warning array. Density hotspots, same-hole stacks, merged tiny
   movements, field/physical-hoop overflow, satin snag advisories, locatable fill construction
   warnings, short/reversal/near-hole and sharp-turn clusters, long sewn/jump spans, and continuous
   runs participate. Spatial fill/satin sidecars must name a catalog code, so a new physical warning
   cannot be silently excluded. Construction analysis additionally consumes internal
   fill/satin IDs, boundaries, captured underlay/compensation policy, layer event identities,
   connector records, and split lanes. Besides containment, fill/border registration and stacking,
   split overlap, and post-plan layer order, full analysis measures wide-construction underlay,
   bounded envelope coverage, and per-construction short-stitch ratios. The event analyzer also
   totals jump burden per uninterrupted color run. Declared thread width contributes to coverage;
   fabric, needle, stabilizer, and topping remain report context rather than warning modifiers until
   physical evidence exists. Directional mismatch is info-level experimental feedback. Analysis
   never infers construction roles from ordinary running stitches. `preflight 'strict'` rejects
   finalization only when this completed list contains severity `error`; warning/info
   recommendations are never fatal. The check reads the completed stream and does not mutate it.
   The compatibility adapter then maps the caller-selected analysis list to `PhysicsReport` version
   2, including catalog/threshold versions and standalone evidence references. By default this is
   the exact policy issue list. With `physicsAnalysis: 'full'`, an `off` policy
   still retains its compatibility preflight result while the physics report additionally receives
   the event-stream and construction findings. `warn` and `strict` already select that full set, so
   the completed analysis is reused rather than rerun.
   Coverage cells, affected point sets, paths/travel, construction regions, boundaries, and satin
   envelopes become renderer-independent geometry with derived anchors and bounds. Event and
   construction checks retain indices in the analyzed pre-lock stream; after locks, preserved event
   identity maps only those events into inclusive indices in the final stitch/jump playback stream.
   Source attribution distinguishes primary, contributor, and related lines, and diagnostics with no
   source carry an explicit generated-source explanation. Fingerprints use code, canonical source
   locations, sorted construction IDs, and semantic geometry quantized to 0.01 mm. Diagnostic copy,
   severity, evidence explanations, remedies, and playback ranges do not participate in identity.
   Measurements are copied from detector output. Expansion catalog entries also expose their
   methodology, false-positive limitations, and analysis cap in expanded UI details.
9. **Assemble `RunResult`** (`index.ts`): `events`, `warnings`,
   `warningLocations`, optional `preflight` and `physics`, `printed`, `locks`, `density` (including `threadWidthMM`), `material`, `machineProfile`, `activeHoop`, `activeOverrides`,
   `globals` (the top-level variable bindings), `chalk`, `dataVars`, and optional
   `plan` statistics. Explicit groups add per-group line, eligibility/movement, accepted-improvement,
   and before/after-travel records.

The load-bearing finalize order is
`flush → calibration → plan → hard-limit split → autotrim → density → locks`.
Planning therefore prevents unnecessary automatic cuts, while locks see only final
run boundaries. The live density grid and history queries intentionally remain in
program order; density accumulation is order-independent. If a history reporter ran and planning
materially reorders the stream, the planner diagnostic explicitly notes that the reporter observed
authored order rather than final sew order.

With local calibration, the live density grid and history reporters likewise retain portable
authored coordinates during execution, while final density is rebuilt from the corrected pre-lock
stream. This prevents a user's private correction from feeding back into NeedleScript control flow.

The `RunResult` shape is defined in `core/types.ts`; downstream, the exporters
(`svg.ts`, `dst.ts`, `pes.ts`, `exp.ts`) consume `events` to produce files.
Because chalk never enters `events`, machine-export inertness is structural rather
than an exporter filtering rule.

`RunResult.machineProfile` and `RunResult.preflight.profile` record the same complete resolved local
configuration: provenance, movement preferences, operation capabilities, speed class, and bounded
affine correction. Default resolution is identity. The event-stream spatial/window metrics live in
the exported `EVENT_STREAM_PREFLIGHT_THRESHOLDS` registry rather than being repeated through the
analyzer.

`RunResult.preflight.mode` records the effective policy, including the default `off`. The playground
groups current findings by severity and stable code. Clicking a finding creates Monaco selections
for all attributed source lines and persists its points as stage markers; hover is temporary. The
show-info toggle filters only rendered findings and never recompiles or changes the result.

`RunResult.physics` is optional in the public type for compatibility with serialized results from
older producers, but every successful in-process `run()` now populates it. Absence means that the
producer does not support PhysicsIntellisense; it is not an empty report. Its `policy` always mirrors
`preflight.mode`, while its diagnostic breadth comes from `RunOptions.physicsAnalysis`. Source
`preflight 'strict'` gates only its own policy result, never extra caller-requested editor findings.
The report also records the resolved machine profile, material intent, default and declared context,
severity summary, semantic hoop-space geometry, exact playback ranges, source roles/reasons, and
deterministic IDs. UI lifecycle state and presentation styling are not part of the core contract.

---

## 14. Design themes

- **Shared-context, function-slot wiring** — a single mutable `RunContext` with
  lazily-referenced function slots resolves the mutual recursion between evaluators
  without classes or circular imports.
- **Loud over convenient** — type mismatches, out-of-range indices, cycles, and
  never-returning reporters all throw `NeedlescriptError` with a hint, rather than
  producing surprising silent output that only shows up after sewing.
- **Deterministic** — same seed plus the same explicit run configuration ⇒ same design. RNG lives on `ctx.rng` (reseedable only
  outside `trace`), generative noise is seeded on its own streams, and the trace
  sandbox restores RNG state so captures don't perturb the main stream.
- **Color as metadata** — `RunContext` owns the declared/auto-extended palette and
  fabric background. `exec-cmd.ts` resolves string colors without consuming RNG;
  `gen-func.ts` hosts the pure color reporters/math; finalization derives
  `RunResult.colorTable` counts and path lengths from unchanged stitch events.
- **Metered** — every allocation and operation is charged against a budget, keeping
  untrusted generative code safe to run in a browser tab; `override` lets authors opt
  into a wider (clearly-warned) envelope.

---

## 15. File reference

| File                                | Responsibility                                                   |
| ----------------------------------- | ---------------------------------------------------------------- |
| `runtime/index.ts`                  | `run()`: pipeline, context construction, module wiring, finalize |
| `runtime/context.ts`                | `RunContext` interface (state + function slots)                  |
| `runtime/signals.ts`                | `ReturnSignal`, `LoopSignal`                                     |
| `runtime/budget.ts`                 | op/cell/string budget metering, trace notes                      |
| `runtime/guards.ts`                 | `truthy`, `toIndex`, `list`, `funcRef`, `checkDepth`             |
| `runtime/eval-expr.ts`              | expression evaluator + trace sandbox                             |
| `runtime/exec-stmt.ts`              | statement/block/loop executor                                    |
| `runtime/exec-cmd.ts`               | `cmd` dispatcher (turtle + directives)                           |
| `runtime/proc-call.ts`              | `callProc`, `callProcVals`, `scalarBuiltin`, `callRef`           |
| `runtime/reporters.ts`              | `@name` reporter contracts + effect clamps                       |
| `runtime/list-func.ts`              | list library dispatcher                                          |
| `runtime/gen-func.ts`               | generative-math dispatcher                                       |
| `embroidery/routing.ts`             | generic route strategy registry + spatial nearest search         |
| `embroidery/travel-planner.ts`      | color/run partitioning and event-level plan strategy registry    |
| `runtime/query-func.ts`             | stitch-history query dispatcher                                  |
| `runtime/string-func.ts`            | string library dispatcher                                        |
| `runtime/list.ts`                   | value model (`Val`, `NsList`, `FuncRef`) + value utilities       |
| `core/colormath.ts`                 | CSS colors, normalization, HSL/RGB, OKLab math and defaults      |
| `embroidery/embroidery-registry.ts` | material profiles and accepted embroidery construction modes     |
| `core/mode-registry.ts`             | typed mode resolution and standard unknown-mode diagnostics      |
| `embroidery/machine/`               | the stitch machine (side-effect target, budgets, events)         |

Interpreter behavior is exercised by tests in `src/lib/__tests__/` — notably
`engine.test.ts`, `language.test.ts`, `loop-control.test.ts`, `lists.test.ts`,
`trace.test.ts`, `override.test.ts`, and `history.test.ts`.
