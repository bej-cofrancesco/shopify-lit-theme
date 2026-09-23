import type { Plugin, ViteDevServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { compileComponentFile, emitLiquidSnippet } from './compile.ts';

export type ShopifyLitPluginOptions = {
  componentsDir?: string;
  outputDir?: string;
  modulePrefix?: string;
};

const DEFAULTS = {
  componentsDir: 'frontend/components',
  outputDir: 'snippets',
  modulePrefix: '@components',
};

export function shopifyLit(userOptions: ShopifyLitPluginOptions = {}): Plugin {
  const options = { ...DEFAULTS, ...userOptions };
  let root = process.cwd();
  let server: ViteDevServer | undefined;

  const run = (file?: string) => {
    const componentsAbs = path.resolve(root, options.componentsDir);
    const outputAbs = path.resolve(root, options.outputDir);

    if (!fs.existsSync(componentsAbs)) return;

    fs.mkdirSync(outputAbs, { recursive: true });

    const files = file ? [file] : walkTsFiles(componentsAbs);

    for (const filePath of files) {
      if (!filePath.startsWith(componentsAbs)) continue;
      if (!/\.(tsx?|jsx?)$/.test(filePath)) continue;
      // Skip Vite entry wrappers and non-component files
      if (filePath.endsWith('.entry.ts') || filePath.endsWith('.entry.js')) continue;
      if (path.basename(filePath).startsWith('boilerplate')) continue;

      const source = fs.readFileSync(filePath, 'utf8');
      const compiled = compileComponentFile(filePath, source, {
        modulePrefix: options.modulePrefix,
      });

      if (!compiled) continue;

      if (compiled.errors.length) {
        for (const err of compiled.errors) {
          console.warn(`[shopify-lit] ${err}`);
        }
      }

      const { filename, content } = emitLiquidSnippet(compiled, {
        viteEntry: compiled.moduleSpecifier,
      });

      const outPath = path.join(outputAbs, filename);
      const prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
      if (prev !== content) {
        fs.writeFileSync(outPath, content, 'utf8');
        console.log(`[shopify-lit] wrote ${path.relative(root, outPath)}`);
      }
    }
  };

  return {
    name: 'shopify-lit',
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      run();
    },
    configureServer(devServer) {
      server = devServer;
      run();

      const componentsAbs = path.resolve(root, options.componentsDir);
      server.watcher.add(componentsAbs);
      server.watcher.on('change', (changed) => {
        if (changed.startsWith(componentsAbs) && /\.(tsx?|jsx?)$/.test(changed)) {
          run(changed);
        }
      });
      server.watcher.on('add', (added) => {
        if (added.startsWith(componentsAbs) && /\.(tsx?|jsx?)$/.test(added)) {
          run(added);
        }
      });
    },
  };
}

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

export default shopifyLit;
export { compileComponentFile, emitLiquidSnippet } from './compile.ts';
