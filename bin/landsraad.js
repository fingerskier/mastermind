#!/usr/bin/env node
// Entry point for `npx landsraad`. Starts the production SvelteKit server.
// In v0 this simply requires that the package has been built (`npm run build`).

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const buildEntry = resolve(here, '..', 'build', 'index.js');

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
