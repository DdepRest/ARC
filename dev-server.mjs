import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((arg, i, arr) => {
  if (arg === '--port' || arg === '-p') return false;
  if (arr[i - 1] === '--port' || arr[i - 1] === '-p') return false;
  return true;
});

const isDev = process.env.NODE_ENV !== 'production';

if (!isDev) {
  // Headless production / preview mode: start a lightweight HTTP server on port 3000
  // to serve the built static files instead of trying to launch Electron.
  const PORT = 3000;
  const PUBLIC_DIR = path.resolve('out/renderer');

  console.log(`Starting headless static web server for A.R.C. on port ${PORT}...`);
  console.log(`Serving files from ${PUBLIC_DIR}`);

  const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2'
  };

  const server = http.createServer((req, res) => {
    // Decode the URL to handle any encoded characters properly
    let filePath = path.join(PUBLIC_DIR, decodeURIComponent(req.url || '/'));
    
    // Default to index.html if request is a directory
    try {
      if (fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch {
      // Fallback to index.html for SPA routing
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') {
          // If file not found, fall back to index.html for SPA/Vue router
          const indexHTMLPath = path.join(PUBLIC_DIR, 'index.html');
          fs.readFile(indexHTMLPath, (err, indexContent) => {
            if (err) {
              res.writeHead(500);
              res.end(`Server Error: ${err.code}`);
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(indexContent, 'utf-8');
            }
          });
        } else {
          res.writeHead(500);
          res.end(`Server Error: ${error.code}`);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`A.R.C. Headless Server is fully operational at http://localhost:${PORT}`);
  });
} else {
  // Development mode: standard Electron-vite development environment with browser preview
  if (!!process.env.AI_STUDIO_PREVIEW || (process.platform !== 'win32' && !process.env.DISPLAY)) {
    console.log('Headless development environment detected. Starting raw vite dev server...');
    const child = spawn('npx', ['vite'], {
      stdio: 'inherit',
      shell: true
    });
    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  } else {
    const command = ['dev'];
    console.log(`Starting electron-vite ${command.join(' ')}`);

    const child = spawn('npx', ['electron-vite', ...command], {
      stdio: 'inherit',
      shell: true
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  }
}

