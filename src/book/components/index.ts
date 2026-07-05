/**
 * src/book/components/index.ts
 *
 * Named exports for all MDX component components.
 * The MDXProvider in Chapter.tsx injects these globally so chapter authors
 * never need to import anything.
 */
export { default as Run } from './Run.tsx';
export { default as RunLocked } from './RunLocked.tsx';
export { default as Scrub } from './Scrub.tsx';
export { default as Quiz } from './Quiz.tsx';
export { default as Checkpoint } from './Checkpoint.tsx';
export { default as Pitfall } from './Pitfall.tsx';
