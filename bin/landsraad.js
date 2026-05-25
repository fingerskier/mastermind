#!/usr/bin/env node
// Entry point for `npx landsraad`.
//   landsraad                    -> start production SvelteKit server
//   landsraad init <source> ...  -> install a council template
//   landsraad export <out> ...   -> export the current council to a template

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const [, , sub, ...rest] = process.argv;

function runScript(scriptRel) {
  const child = spawn(
    process.execPath,
    [resolve(repoRoot, 'node_modules', 'vite-node', 'vite-node.mjs'), scriptRel, '--', ...rest],
    { stdio: 'inherit', env: process.env, cwd: process.cwd() }
  );
  child.on('exit', (code) => process.exit(code ?? 0));
}

if (sub === 'init') {
  runScript(resolve(repoRoot, 'scripts', 'template-install.ts'));
} else if (sub === 'export') {
  runScript(resolve(repoRoot, 'scripts', 'template-export.ts'));
} else {
  // Default: start the server.
  const buildEntry = resolve(repoRoot, 'build', 'index.js');
  if (!existsSync(buildEntry)) {
    console.error(
      'Landsraad has not been built yet.\n' +
        'From the repo root, run:\n' +
        '  npm install\n' +
        '  npm run build\n' +
        '  npm start\n\n' +
        'Or for development: npm run dev'
    );
    process.exit(1);
  }
  const child = spawn(process.execPath, [buildEntry], { stdio: 'inherit', env: process.env });
  child.on('exit', (code) => process.exit(code ?? 0));
}
