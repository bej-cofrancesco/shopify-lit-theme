import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import shopify from 'vite-plugin-shopify';
import pageReload from 'vite-plugin-page-reload';
import importMaps from 'vite-plugin-shopify-import-maps';
import { resolve } from 'node:path';

export default defineConfig({
  publicDir: 'public',
  resolve: {
    alias: {
      '@entrypoints': resolve('frontend/entrypoints'),
      '@components': resolve('frontend/components'),
      '@frontend': resolve('frontend'),
      '@': resolve('frontend'),
      '~': resolve('frontend'),
    },
  },
  plugins: [
    shopify({
      tunnel: true,
      snippetFile: 'vite.liquid',
      additionalEntrypoints: ['frontend/components/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    }),
    pageReload('/tmp/theme.update', {
      delay: 2000,
    }),
    importMaps({ bareModules: true }),
    tailwindcss(),
  ],
});
