# NeedleScript

A Logo-inspired programming language and playground for **generative embroidery**. You write
turtle-graphics code, NeedleScript turns it into machine-ready stitches—running stitch, satin,
bean, blanket, and tatami fills—previews them in a virtual hoop, and exports a Tajima `.DST` file
you can sew on a real embroidery machine.

The goal is to let creatives make embroidery that cannot easily be drawn in traditional embroidery
software: noise fields, recursion, parametric curves, and deterministic randomness.

```text
// strands drift through a smooth noise field
def strand() [
  repeat 90 [
    seth (noise2 xcor / 16 ycor / 16) * 720
    fd 1.8
    if distance(0, 0) > 40 [ return ]
  ]
]

seed 9
stitchlen 2
repeat 14 [
  moveto random(64) - 32, random(64) - 32
  strand()
  trim
]
```

## Documentation

- [NeedleScript language reference](./docs/needlescript-language-reference.md) — explanatory guide for
  people and the playground reference dialog.
- [Standard library reference](./docs/needlescript-standard-library-reference.md) — modules,
  procedures, geometry, RNG behavior, and sewing notes.
- [Compact language reference](./docs/needlescript-language-reference.llm.md) — condensed context for
  language models and other tooling.
- [Documentation directory](./docs/) — tutorial, architecture notes, implementation specifications,
  and physical sew-out protocols.

All three references are generated from
[`needlescript-language-reference.json`](./docs/needlescript-language-reference.json). Edit that source
and run `npm run reference:generate`; use `npm run reference:check` to detect stale generated files.

## Setup

Requirements: Node.js ≥ 20 and npm.

```bash
npm install
npm run dev
```

The playground is available at <http://localhost:5173>.

| Command                           | What it does                                        |
| --------------------------------- | --------------------------------------------------- |
| `npm run build`                   | Typecheck and build the app into `dist/`            |
| `npm run build:lib`               | Build the publishable library into `dist-lib/`      |
| `npm run preview`                 | Serve the production build locally                  |
| `npm run examples:previews`       | Regenerate bundled-example thumbnails               |
| `npm run examples:previews:watch` | Watch examples and update their thumbnails          |
| `npm run examples:previews:check` | Verify that committed thumbnails are current        |
| `npm run reference:generate`      | Regenerate language and standard-library references |
| `npm run reference:check`         | Verify that generated references are current        |
| `npm test`                        | Run the Vitest suite once                           |
| `npm run test:watch`              | Run tests in watch mode                             |
| `npm run test:coverage`           | Run tests with V8 coverage                          |
| `npm run lint`                    | Run ESLint over the project                         |
| `npm run physics:rates`           | Report expected/absent diagnostic rates by code     |
| `npm run physics:benchmark`       | Benchmark full physics analysis at three sizes      |
| `npm run physics:a11y`            | Check Physics motion and contrast CSS               |

The app is a React 19 + TypeScript + Vite single-page app. The language engine in `src/lib/` has
no DOM dependencies and can be used as a standalone library.

## Project structure

```text
src/
├── lib/                    platform-neutral language engine
│   ├── core/               shared registries and primitives
│   ├── language/           tokenizer, pre-scan, parser, and AST
│   ├── runtime/            interpreter and value model
│   ├── geometry/           paths, curves, generators, and operations
│   ├── embroidery/         stitch machine, fills, and post-processing
│   ├── formats/            embroidery and vector exporters
│   ├── editor/             Monaco language support
│   ├── engine.ts           public library surface
│   └── __tests__/          Vitest suites
├── components/             playground UI
├── svg-import/             browser SVG adapter and import policy
├── compiler.worker.ts      background compilation worker
├── data.ts                 palettes, hoops, and bundled examples
└── App.tsx                 playground application
```

The language pipeline is:

```text
source → tokenize → parse → run → RunResult → exporters
```

See the [parser](./docs/needlescript-parser-architecture.md),
[interpreter](./docs/needlescript-interpreter-architecture.md), and
[machine](./docs/needlescript-machine-architecture.md) architecture documents for detailed module
design and data flow.

## Playground

- **Editor** — Monaco editing, completions, hover documentation, and source-line diagnostics.
- **REPL and console** — run commands interactively and inspect output, warnings, and errors.
- **Stage and playback** — preview the hoop, stitches, jumps, density, point handles, and sewing
  order.
- **Physics** — inspect modeled blockers, risks, and notes with linked source, geometry, playback,
  measurements, threshold/evidence provenance, and previewable reviewed remedies. Physics analysis
  is independent from the source's portable `preflight` export policy and never edits stitches.
- **Examples** — search bundled programs by technique, language feature, or purpose.
- **Customizer** — expose sliders, toggles, text inputs, paths, curves, point handles, and presets
  with source annotations documented in the
  [language reference](./docs/needlescript-language-reference.md#22-customizer-annotations-comment-level-invisible-to-the-interpreter).
- **Import SVG** — convert supported vector structure into editable NeedleScript source.
- **Export** — download designs as Tajima `.DST` files.

## AI generation

The REPL can generate, improve, fix, and explain designs using a model available through
[OpenRouter](https://openrouter.ai). An API key is required.

```text
/ai apikey sk-or-v1-…
/ai model claude sonnet
/ai create <description>
/ai improve <instruction>
/ai fix <instruction>
/ai explain <question>
/ai reset
/ai help
```

The selected key and model are stored in browser `localStorage`. Generation receives the compact
NeedleScript reference. Before generated source is placed in the editor, the playground compiles it
with full physics analysis and runs up to two bounded revision passes. Compiler failures are returned
with their reported source line; modeled blockers and risks are returned with source roles, line
text, measurements, evidence limits, and prioritized construction remedies. The best successfully
compiled revision is retained if a later revision regresses. Informational physics notes remain for
human review and do not trigger automatic source changes.

The editor's **AI** output tab opens when a command starts and keeps the latest activity timeline:
requested candidates, the provider model used, token/cost metadata when available, compiler checks,
structured physics feedback, revision decisions, and the final candidate applied to the editor.
Expandable details show exactly which line-level compiler or physics context was returned to the
model without exposing the stored API key.

## Using the engine as a library

The engine is published as [`needlescript`](https://www.npmjs.com/package/needlescript), an ESM-only,
DOM-free package:

```bash
npm install needlescript
```

```ts
import { run, designStats, toDST } from 'needlescript';

const result = run('repeat 36 [ fd 4 rt 10 ]', { seed: 7 });
const stats = designStats(result.events);
const bytes = toDST(result.events, 'rose');
```

The public API also exposes the tokenizer, parser, exporters, post-processing helpers, deterministic
RNG utilities, command registries, limits, and error/value types through `src/lib/engine.ts`.

## Tests

```bash
npm test
```

The Vitest suites in `src/lib/__tests__/` cover the language pipeline, runtime behavior, embroidery
construction, exporters, editor integration, bundled examples, and generated-reference coverage.

## License

[MIT](./LICENSE) © Fredi Bach
