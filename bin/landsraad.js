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

function runBundled(relPath) {
  const entry = resolve(repoRoot, relPath);
  if (!existsSync(entry)) {
    console.error(
      `Landsraad has not been built yet (missing ${relPath}).\n` +
        'From the repo root, run:\n' +
        '  npm install\n' +
        '  npm run build'
    );
    process.exit(1);
  }
  const child = spawn(process.execPath, [entry, ...rest], {
    stdio: 'inherit',
    env: { ...process.env, LANDSRAAD_PKG_ROOT: repoRoot },
    cwd: process.cwd()
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

if (sub === 'init') {
  runBundled('build/cli/template-install.mjs');
} else if (sub === 'export') {
  runBundled('build/cli/template-export.mjs');
} else {
  runBundled('build/index.js');
}
