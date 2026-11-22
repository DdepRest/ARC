import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { resolveBuildMetadata } from './src/shared/config/build-metadata.resolver';

export default defineConfig(({mode}) => {
  const _env = loadEnv(mode, '.', '');
  void _env;
  const buildMetadata = resolveBuildMetadata({ repoRoot: __dirname });
  return {
    root: 'src/renderer',
    plugins: [vue(), tailwindcss()],
    define: {
      '__BUILD_COMMIT__': JSON.stringify(buildMetadata.commit),
      '__BUILD_COMMIT_FULL__': JSON.stringify(buildMetadata.commitFull),
      '__BUILD_COMMIT_SOURCE__': JSON.stringify(buildMetadata.commitSource),
      '__APP_VERSION__': JSON.stringify(buildMetadata.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer'),
        '@shared': path.resolve(__dirname, './src/shared'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      allowedHosts: true,
    },
    build: {
      outDir: '../../dist',
      emptyOutDir: true,
    }
  };
});
