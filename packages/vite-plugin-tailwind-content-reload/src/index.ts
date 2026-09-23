import type { Plugin, ViteDevServer } from 'vite';
import { resolve } from 'node:path';

export type TailwindContentReloadOptions = {
  /** Absolute or root-relative CSS entry that imports Tailwind */
  cssEntry?: string;
  /** Extra globs/dirs to watch (default: src/frontend/components, dist/snippets) */
  watch?: string[];
};

/**
 * Tailwind v4 often fails to rescan `@source` files on edit until Vite
 * restarts. Invalidate the CSS entry and full-reload so Liquid + CSS match.
 */
export function tailwindContentReload(
  options: TailwindContentReloadOptions = {},
): Plugin {
  const cssEntry = options.cssEntry ?? 'src/frontend/entrypoints/theme.css';
  let root = process.cwd();
  let server: ViteDevServer | undefined;

  const refresh = (reason: string) => {
    if (!server) return;

    const cssFile = resolve(root, cssEntry);
    const modules = server.moduleGraph.getModulesByFile(cssFile);
    if (modules) {
      for (const mod of modules) {
        server.moduleGraph.invalidateModule(mod);
      }
    }

    for (const mod of server.moduleGraph.idToModuleMap.values()) {
      if (mod.file && /\.css$/i.test(mod.file) && mod.file.includes('theme')) {
        server.moduleGraph.invalidateModule(mod);
      }
    }

    server.ws.send({ type: 'full-reload', path: cssFile });
    server.config.logger.info(`[tailwind-reload] ${reason}`, { timestamp: true });
  };

  return {
    name: 'tailwind-content-reload',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
    },
    configureServer(devServer) {
      server = devServer;

      const watchDirs = (
        options.watch ?? ['src/frontend/components', 'dist/snippets']
      ).map((p) => resolve(root, p));

      for (const dir of watchDirs) {
        server.watcher.add(dir);
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastReason = '';

      const schedule = (file: string) => {
        lastReason = file;
        clearTimeout(timer);
        timer = setTimeout(() => {
          refresh(lastReason.replace(root + '/', ''));
        }, 50);
      };

      const onFsChange = (file: string) => {
        if (!/\.(tsx?|jsx?|liquid|css)$/i.test(file)) return;
        if (file.includes('node_modules') || file.includes('/assets/')) return;

        const hit = watchDirs.some(
          (dir) =>
            file === dir ||
            file.startsWith(dir + '/') ||
            file.startsWith(dir + '\\'),
        );
        if (!hit && !file.endsWith('theme.css')) return;

        schedule(file);
      };

      server.watcher.on('change', onFsChange);
      server.watcher.on('add', onFsChange);
    },
  };
}

export default tailwindContentReload;
