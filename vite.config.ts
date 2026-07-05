import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import rehypeSlug from 'rehype-slug';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // MDX must come before @vitejs/plugin-react so JSX is already transformed.
    // enforce: 'pre' ensures rolldown runs MDX before its built-in TS transform.
    // include: '**/*.mdx' — restrict to .mdx only so that plain .md files
    // imported with ?raw (e.g. needlescript-tutorial.md) stay as raw strings.
    {
      ...mdx({
        include: '**/*.mdx',
        providerImportSource: '@mdx-js/react',
        remarkPlugins: [remarkFrontmatter, [remarkMdxFrontmatter, { name: 'meta' }]],
        rehypePlugins: [rehypeSlug],
      }),
      enforce: 'pre',
    },
    tailwindcss(),
    react({ include: /\.(jsx|tsx|mdx)$/ }),
    process.env.ANALYZE ? visualizer({ open: true, gzipSize: true, brotliSize: true }) : null,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
