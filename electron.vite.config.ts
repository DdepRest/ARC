import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { PROD_CSP } from './src/shared/config/csp.config'

function getBuildCommit(): string {
  if (process.env.BUILD_COMMIT) {
    return process.env.BUILD_COMMIT.substring(0, 7);
  }
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (hash) return hash;
  } catch (e) {}
  const commitFile = resolve(__dirname, '.commit_hash');
  if (fs.existsSync(commitFile)) {
    return fs.readFileSync(commitFile, 'utf-8').trim().substring(0, 7);
  }
  return '9048f71';
}

const buildCommit = getBuildCommit();

function cspHtmlPlugin() {
  return {
    name: 'csp-html-transform',
    transformIndexHtml(html: string, ctx: any) {
      // In production builds (or when bundling for electron distribution), inject strict PROD_CSP meta tag
      if (ctx?.bundle || process.env.NODE_ENV === 'production') {
        const metaTag = `<meta http-equiv="Content-Security-Policy" content="${PROD_CSP}">`
        return html.replace('<head>', `<head>\n    ${metaTag}`)
      }
      return html
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        'sharp': resolve(__dirname, 'src/main/empty.ts')
      }
    },
    build: {
      rollupOptions: {
        external: ['sharp', 'onnxruntime-node']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.ts')
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name]-[hash][extname]'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    server: {
      port: 3000,
      host: '127.0.0.1',
      hmr: false
    },
    define: {
      '__BUILD_COMMIT__': JSON.stringify(buildCommit)
    },
    plugins: [vue(), tailwindcss(), cspHtmlPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
