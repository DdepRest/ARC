import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { PROD_CSP } from './src/shared/config/csp.config'
import { resolveBuildMetadata } from './src/shared/config/build-metadata.resolver'

const buildMetadata = resolveBuildMetadata({ repoRoot: __dirname });
const buildDefines = {
  '__BUILD_COMMIT__': JSON.stringify(buildMetadata.commit),
  '__BUILD_COMMIT_FULL__': JSON.stringify(buildMetadata.commitFull),
  '__BUILD_COMMIT_SOURCE__': JSON.stringify(buildMetadata.commitSource),
  '__APP_VERSION__': JSON.stringify(buildMetadata.version),
};

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
    define: buildDefines,
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
    define: buildDefines,
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
