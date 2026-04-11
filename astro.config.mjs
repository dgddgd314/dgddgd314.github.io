import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite'; // 최신 v4 방식
import mdx from '@astrojs/mdx';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://dgddgd314.github.io',

  integrations: [mdx()],

  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },

  vite: {
    plugins: [tailwindcss()]
  }
});