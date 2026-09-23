import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import shopify from 'vite-plugin-shopify';
import pageReload from 'vite-plugin-page-reload';
import importMaps from 'vite-plugin-shopify-import-maps';
import { shopifyLit } from './shopify-lit/vite/index.ts';
import { tailwindContentReload } from './frontend/lib/tailwind-content-reload.ts';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));

function findPkgRoot(fromFile: string): string {
  let dir = dirname(fromFile);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  throw new Error(`No package.json above ${fromFile}`);
}

function findPnpmPackage(name: string, near: string): string {
  const search = name.startsWith('@')
    ? name.replace('/', '+') + '@'
    : `${name}@`;

  let dir = near;
  while (dir !== dirname(dir)) {
    const pnpm = join(dir, 'node_modules/.pnpm');
    if (existsSync(pnpm)) {
      for (const entry of readdirSync(pnpm)) {
        if (!entry.startsWith(search)) continue;
        const pkgPath = join(pnpm, entry, 'node_modules', ...name.split('/'));
        if (existsSync(join(pkgPath, 'package.json'))) return pkgPath;
      }
    }
    dir = dirname(dir);
  }
  throw new Error(`Could not find pnpm package ${name} near ${near}`);
}

/**
 * Absorb reads lit-html private fields (`_$startNode`, `_$parts`, …).
 * Production lit mangles those — pin development builds so absorb + updates work.
 */
const litHtml = findPkgRoot(
  require.resolve('lit-html', { paths: [join(root, 'shopify-lit'), root] }),
);
const litElementRoot = findPnpmPackage('lit-element', litHtml);
const reactiveRoot = findPnpmPackage('@lit/reactive-element', litHtml);

const litDevAliases = [
  {
    find: /^lit-html$/,
    replacement: join(litHtml, 'development/lit-html.js'),
  },
  {
    find: /^lit-html\/(.+)$/,
    replacement: join(litHtml, 'development/$1'),
  },
  {
    find: /^@lit\/reactive-element$/,
    replacement: join(reactiveRoot, 'development/reactive-element.js'),
  },
  {
    find: /^@lit\/reactive-element\/(.+)$/,
    replacement: join(reactiveRoot, 'development/$1'),
  },
  {
    find: /^lit-element$/,
    replacement: join(litElementRoot, 'development/index.js'),
  },
  {
    find: /^lit-element\/(.+)$/,
    replacement: join(litElementRoot, 'development/$1'),
  },
];

export default defineConfig(({ command }) => ({
  publicDir: 'public',
  resolve: {
    alias: [
      ...litDevAliases,
      { find: '@entrypoints', replacement: resolve('frontend/entrypoints') },
      { find: '@components', replacement: resolve('frontend/components') },
      { find: '@frontend', replacement: resolve('frontend') },
      { find: '@', replacement: resolve('frontend') },
      { find: '~', replacement: resolve('frontend') },
      {
        find: 'shopify-lit/decorators',
        replacement: resolve('shopify-lit/src/decorators.ts'),
      },
      {
        find: 'shopify-lit/vite',
        replacement: resolve('shopify-lit/vite/index.ts'),
      },
      { find: 'shopify-lit', replacement: resolve('shopify-lit/src/index.ts') },
    ],
  },
  plugins: [
    // Before Tailwind so snippet writes are on disk when CSS rescans
    shopifyLit({
      componentsDir: 'frontend/components',
      outputDir: 'snippets',
      modulePrefix: '@components',
    }),
    tailwindcss(),
    tailwindContentReload({
      cssEntry: 'frontend/entrypoints/theme.css',
      watch: ['frontend/components', 'snippets', 'frontend/entrypoints'],
    }),
    shopify({
      tunnel: true,
      snippetFile: 'vite.liquid',
      additionalEntrypoints: ['frontend/components/**/*.{js,ts}'],
    }),
    pageReload('/tmp/theme.update', {
      delay: 500,
    }),
    ...(command === 'build' ? [importMaps({ bareModules: true })] : []),
  ],
}));
