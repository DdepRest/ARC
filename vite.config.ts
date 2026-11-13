import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import {defineConfig, loadEnv} from 'vite';

function getBuildCommit(): string {
  if (process.env.BUILD_COMMIT) {
    return process.env.BUILD_COMMIT.substring(0, 7);
  }
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (hash) return hash;
  } catch (e) {}
  const commitFile = path.resolve(__dirname, '.commit_hash');
  if (fs.existsSync(commitFile)) {
    return fs.readFileSync(commitFile, 'utf-8').trim().substring(0, 7);
  }
  return '9048f71';
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const buildCommit = getBuildCommit();
  return {
    root: 'src/renderer',
    plugins: [vue(), tailwindcss()],
    define: {
      '__BUILD_COMMIT__': JSON.stringify(buildCommit),
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
