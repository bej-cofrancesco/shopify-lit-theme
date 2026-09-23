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

const AUTO_GEN_MARKER = 'AUTO-GENERATED from';

export function shopifyLit(userOptions: ShopifyLitPluginOptions = {}): Plugin {
  const options = { ...DEFAULTS, ...userOptions };
  let root = process.cwd();
  let server: ViteDevServer | undefined;

  const componentsAbs = () => path.resolve(root, options.componentsDir);
  const outputAbs = () => path.resolve(root, options.outputDir);

  const notifySnippetChange = (outPath: string) => {
    if (!server) return;
    const cssFile = path.resolve(root, 'src/frontend/entrypoints/theme.css');
    const modules = server.moduleGraph.getModulesByFile(cssFile);
    if (modules) {
      for (const mod of modules) {
        server.moduleGraph.invalidateModule(mod);
      }
    }
    server.ws.send({ type: 'full-reload', path: outPath });
  };

  const writeSnippet = (filePath: string): string | null => {
    const source = fs.readFileSync(filePath, 'utf8');
    const compiled = compileComponentFile(filePath, source, {
      modulePrefix: options.modulePrefix,
    });

    if (!compiled) return null;

    if (compiled.errors.length) {
      for (const err of compiled.errors) {
        console.warn(`[shopify-lit] ${err}`);
      }
    }

    const { filename, content } = emitLiquidSnippet(compiled, {
      viteEntry: compiled.moduleSpecifier,
    });

    const outPath = path.join(outputAbs(), filename);
    const prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    if (prev !== content) {
      fs.writeFileSync(outPath, content, 'utf8');
      console.log(`[shopify-lit] wrote ${path.relative(root, outPath)}`);
      notifySnippetChange(outPath);
    }
    return filename;
  };

  /** Remove auto-generated snippets whose component no longer exists. */
  const pruneOrphans = (keep: Set<string>) => {
    const outDir = outputAbs();
    if (!fs.existsSync(outDir)) return;

    for (const name of fs.readdirSync(outDir)) {
      if (!name.endsWith('.liquid')) continue;
      if (keep.has(name)) continue;

      const outPath = path.join(outDir, name);
      let head = '';
      try {
        head = fs.readFileSync(outPath, 'utf8').slice(0, 200);
      } catch {
        continue;
      }
      if (!head.includes(AUTO_GEN_MARKER)) continue;

      fs.unlinkSync(outPath);
      console.log(`[shopify-lit] removed ${path.relative(root, outPath)}`);
      notifySnippetChange(outPath);
    }
  };

  const runAll = () => {
    const comps = componentsAbs();
    const outDir = outputAbs();
    if (!fs.existsSync(comps)) return;

    fs.mkdirSync(outDir, { recursive: true });

    const keep = new Set<string>();
    for (const filePath of walkTsFiles(comps)) {
      const filename = writeSnippet(filePath);
      if (filename) keep.add(filename);
    }
    pruneOrphans(keep);
  };

  const removeSnippetForComponent = (filePath: string) => {
    const base = path.basename(filePath, path.extname(filePath));
    const outPath = path.join(outputAbs(), `${base}.liquid`);
    if (!fs.existsSync(outPath)) return;

    const head = fs.readFileSync(outPath, 'utf8').slice(0, 200);
    if (!head.includes(AUTO_GEN_MARKER)) return;

    fs.unlinkSync(outPath);
    console.log(`[shopify-lit] removed ${path.relative(root, outPath)}`);
    notifySnippetChange(outPath);
  };

  return {
    name: 'shopify-lit',
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      runAll();
    },
    configureServer(devServer) {
      server = devServer;
      runAll();

      const comps = componentsAbs();
      server.watcher.add(comps);

      server.watcher.on('change', (changed) => {
        if (changed.startsWith(comps) && /\.(tsx?|jsx?)$/.test(changed)) {
          writeSnippet(changed);
        }
      });
      server.watcher.on('add', (added) => {
        if (added.startsWith(comps) && /\.(tsx?|jsx?)$/.test(added)) {
          writeSnippet(added);
        }
      });
      server.watcher.on('unlink', (removed) => {
        if (removed.startsWith(comps) && /\.(tsx?|jsx?)$/.test(removed)) {
          removeSnippetForComponent(removed);
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
      if (entry.name.endsWith('.entry.ts') || entry.name.endsWith('.entry.js')) {
        continue;
      }
      results.push(full);
    }
  }
  return results;
}

export default shopifyLit;
export { compileComponentFile, emitLiquidSnippet } from './compile.ts';
