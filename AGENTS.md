# AGENTS.md

NeedleScript is a logo-inspired programming language for generative embroidery.
The repo contains two build targets: a Vite-based playground app and a publishable library (`src/lib/`).

## Architecture documentation

The language pipeline in `src/lib/` is documented in detail. Read the relevant document before making non-trivial changes to these areas — each explains the module layout, data flow, and design rationale, with `file:line` references.

| Document                                   | Covers                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `needlescript-language-reference.md`       | Agent-oriented language reference                                                                                                  |
| `needlescript-parser-architecture.md`      | Front-end: tokenizer, pre-scan, recursive-descent parser, AST (`language/tokenizer.ts`, `language/prescan.ts`, `language/parser/`) |
| `needlescript-interpreter-architecture.md` | Evaluation: tree-walking interpreter, value model, budgets, reporters (`runtime/`, `runtime/list.ts`)                              |
| `needlescript-machine-architecture.md`     | Stitch machine: turtle, transform stacks, satin/fill generation, coverage, output (`embroidery/machine/`)                          |

The end-to-end flow is: source → `tokenize` → `parse` → `run` (interpreter drives the `Machine`) → `RunResult` → exporters. Keep these docs updated when you change the corresponding modules.

`src/lib/engine.ts` is the stable public barrel. Implementations are grouped by responsibility:
`core/`, `language/`, `geometry/`, `embroidery/`, `runtime/`, `formats/`, and `editor/`.

## Dev environment

- Node version is managed via `.nvmrc` (`lts/*`). Use `nvm use` before starting.
- Install dependencies: `npm install`
- Start the playground: `npm run dev`
- Start with Vercel API support: `npm run dev:vercel`

## Quick command reference

| Purpose             | Command                  |
| ------------------- | ------------------------ |
| Run tests           | `npm test`               |
| Watch tests         | `npm run test:watch`     |
| Test coverage       | `npm run test:coverage`  |
| Format code         | `npm run format`         |
| Check formatting    | `npx prettier --check .` |
| Lint                | `npm run lint`           |
| Build app           | `npm run build`          |
| Build library       | `npm run build:lib`      |
| Validate library    | `npm run check:lib`      |
| React Doctor        | `npm run doctor`         |
| Find dead code      | `npm run knip`           |
| Check outdated pkgs | `npm outdated`           |

## Testing

Tests use Vitest with the `happy-dom` environment and live in `src/lib/__tests__/*.test.ts`.

- Prefer writing or updating tests for any library code you add or change.
- Run `npm test` and make sure the full suite passes before finishing.
- **Never use `Math.random` in `src/lib/`** — the test setup intercepts and throws on it. Use the project's seeded PRNG instead.
- Coverage can be reviewed with `npm run test:coverage`.

## Code formatting

Prettier is configured in `.prettierrc`: single quotes, 100-character line width, trailing commas, semicolons, 2-space indent.
`.prettierignore` excludes `dist/`, `dist-lib/`, `coverage/`, and `*.ns` files.

- Run `npm run format` to auto-format all files.
- Run `npx prettier --check .` to verify without writing.
- Formatting should be clean before wrapping up any task.

## Linting

ESLint uses flat config (`eslint.config.js`) with TypeScript, React Hooks, React Refresh, and Prettier compatibility plugins.

- Run `npm run lint` — prefer fixing all reported errors before finishing.
- After moving files or changing imports, re-run lint to catch any broken references.

## Build integrity

- **App build:** `npm run build` (`tsc -b && vite build`) — should complete without errors.
- **Library build:** `npm run build:lib` followed by `npm run check:lib` — should complete without errors.
- TypeScript is strict: `noUnusedLocals`, `noUnusedParameters`, and `erasableSyntaxOnly` are all enforced.
- The path alias `@` resolves to `./src`.

## React Doctor

[React Doctor](https://react.doctor/) scans for security, performance, correctness, accessibility, bundle-size, and architecture issues.

- Run `npm run doctor` locally after working on React components.
- CI runs React Doctor automatically on every PR (`.github/workflows/react-doctor.yml`) and on pushes to `main`.
- Only address issues in new or edited code. New code should not introduce regressions in the Doctor report.

## Performance and architecture

- See the **Architecture documentation** section above for the parser, interpreter, and machine design docs before making non-trivial changes to `src/lib/`.
- CPU-intensive work (e.g. the compiler) runs in a Web Worker (`src/compiler.worker.ts`) via Comlink. Prefer this pattern for any heavy computation.
- `src/lib/` is platform-neutral — no DOM APIs. Keep it that way so the library build stays environment-agnostic.
- The library build uses tree-shaking. Prefer avoiding side-effectful top-level code in `src/lib/`.
- Run `npm run knip` to spot dead code. If your changes introduce unused exports or files, prefer removing them. Avoid removing pre-existing dead code that is unrelated to your work.

## Package management

- Run `npm outdated` to see what has updates available.
- Use `npm update` for semver-compatible (minor/patch) updates. Avoid major version bumps unless explicitly requested.
- After updating packages, run the full check suite: `npm test`, `npm run lint`, `npm run build`.

## Adding a language command or mode

Before considering a user-visible command or mode complete:

- Add its canonical name and arity to the appropriate table in `src/lib/language/commands.ts`. Add special
  Core statement forms to `CORE_COMMAND_NAMES` as well.
- Put embroidery construction modes and their numeric bounds in a focused registry; do not repeat
  literal choice lists in the parser, runtime, or Monaco snippets.
- Resolve string modes with the shared case-insensitive helpers in `src/lib/core/mode-registry.ts` so
  unknown values get the standard choices and did-you-mean diagnostic.
- Add a Monaco catalog item with completion text, hover documentation, and `params` signature
  metadata. Catalog coverage tests intentionally fail when any Core command omits one of these.
- Document syntax, units, bounds, defaults, output semantics, warnings, transform space, and RNG
  draw behavior in `needlescript-language-reference.md` and the relevant architecture document.
- Add parser/runtime tests, compatibility fixtures for changed generators, and tests that every
  registered mode appears in editor documentation.

## General coding practices

- Prefer TypeScript strict types — avoid `any`, keep types explicit.
- The project is pure ESM (`"type": "module"`). Prefer ESM patterns; avoid CommonJS.
- Prefer small, focused functions. Functional patterns are a good fit for this project.
- `src/lib/` is the publishable core — keep it free of UI, DOM, and app-level dependencies.
- shadcn UI components live in `src/components/ui/`. Custom components go in `src/components/`.
- Vercel serverless API routes live in `api/`.
