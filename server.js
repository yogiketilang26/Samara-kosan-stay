/**
 * Production Entry Wrapper for Cloud Run
 * Dispatches to bundled dist/server.js if built, or registers tsx loader for server.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distServerPath = path.join(__dirname, 'dist', 'server.js');
const distServerCjsPath = path.join(__dirname, 'dist', 'server.cjs');

if (fs.existsSync(distServerPath)) {
  await import('./dist/server.js');
} else if (fs.existsSync(distServerCjsPath)) {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  require(distServerCjsPath);
} else {
  const { register } = await import('node:module');
  register('tsx', import.meta.url);
  await import('./server.ts');
}
