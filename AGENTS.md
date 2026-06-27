# AGENTS.md

NeedleScript is a logo-inspired programming language for generative embroidery.
The repo contains two build targets: a Vite-based playground app and a publishable library (`src/lib/`).

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

- CPU-intensive work (e.g. the compiler) runs in a Web Worker (`src/compiler.worker.ts`) via Comlink. Prefer this pattern for any heavy computation.
- `src/lib/` is platform-neutral — no DOM APIs. Keep it that way so the library build stays environment-agnostic.
- The library build uses tree-shaking. Prefer avoiding side-effectful top-level code in `src/lib/`.
- Run `npm run knip` to spot dead code. If your changes introduce unused exports or files, prefer removing them. Avoid removing pre-existing dead code that is unrelated to your work.

## Package management

- Run `npm outdated` to see what has updates available.
- Use `npm update` for semver-compatible (minor/patch) updates. Avoid major version bumps unless explicitly requested.
- After updating packages, run the full check suite: `npm test`, `npm run lint`, `npm run build`.

## General coding practices

- Prefer TypeScript strict types — avoid `any`, keep types explicit.
- The project is pure ESM (`"type": "module"`). Prefer ESM patterns; avoid CommonJS.
- Prefer small, focused functions. Functional patterns are a good fit for this project.
- `src/lib/` is the publishable core — keep it free of UI, DOM, and app-level dependencies.
- shadcn UI components live in `src/components/ui/`. Custom components go in `src/components/`.
- Vercel serverless API routes live in `api/`.
