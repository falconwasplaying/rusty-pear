import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, withFilter } from 'vite';
import viteResolve from 'vite-plugin-resolve';
import solidPlugin from 'vite-plugin-solid';

import { i18nImporter } from './vite-plugins/i18n-importer.mjs';
import { pluginVirtualModuleGenerator } from './vite-plugins/plugin-importer.mjs';
import pluginLoader from './vite-plugins/plugin-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const resolveAlias = {
  '@': resolve(__dirname, './src'),
  '@assets': resolve(__dirname, './assets'),
};

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    root: './src/',
    plugins: [
      pluginLoader('renderer'),
      viteResolve({
        'virtual:i18n': i18nImporter(),
        'virtual:plugins': pluginVirtualModuleGenerator('renderer'),
      }),
      withFilter(solidPlugin(), {
        load: { id: [/\.(tsx|jsx)$/, '/@solid-refresh'] },
      }),
    ],
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      emptyOutDir: true,
      lib: {
        entry: resolve(__dirname, 'src/renderer.ts'),
        formats: ['iife'],
        name: 'renderer',
        fileName: () => 'renderer.js',
      },
      minify: !isDev,
      cssMinify: !isDev,
      sourcemap: isDev ? 'inline' : false,
    },
    resolve: {
      alias: resolveAlias,
    },
    server: {
      port: 5173,
      strictPort: true,
      cors: {
        origin: 'https://music.youtube.com',
      },
    },
  };
});
