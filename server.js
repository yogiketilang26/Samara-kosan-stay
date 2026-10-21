/**
 * Production Entry Wrapper for Cloud Run
 * Executes freshly compiled ./dist/server.js from `npm run build` in production (zero-latency startup without devDependencies),
 * or falls back to executing ./server.ts via tsx loader when running without a prebuilt bundle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compiledServerPath = path.join(__dirname, 'dist', 'server.js');
const sourceServerPath = path.join(__dirname, 'server.ts');

let useCompiled = fs.existsSync(compiledServerPath);
if (useCompiled && fs.existsSync(sourceServerPath) && process.env.FORCE_TSX_RUNTIME === 'true') {
  useCompiled = false;
}

if (useCompiled) {
  await import('./dist/server.js');
} else {
  const { register } = await import('node:module');
  try {
    register('tsx/esm', import.meta.url);
  } catch {
    register('tsx', import.meta.url);
  }
  await import('./server.ts');
}

