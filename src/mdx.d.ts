/// <reference types="vite/client" />

// Allow importing .mdx files as React components with a named `meta` export.
declare module '*.mdx' {
  import type { ComponentType } from 'react';
  import type { ChapterMeta } from './book/lib/chapters.ts';

  const MDXComponent: ComponentType;
  export const meta: ChapterMeta;
  export default MDXComponent;
}
