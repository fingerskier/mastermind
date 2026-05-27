#!/usr/bin/env node
// Entry point for `npx landsraad`.
//   landsraad                    -> start production SvelteKit server
//   landsraad init <source> ...  -> install a council template
//   landsraad export <out> ...   -> export the current council to a template

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { findFreePort } from './find-port.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const DEFAULT_PORT = 10191;
const PORT_SCAN_RANGE = 100;

const [, , sub, ...rest] = process.argv;

function openInBrowser(url) {
  const plat = platform();
  let cmd;
  let args;
  if (plat === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '""', url];
  } else if (plat === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // ignore — auto-open is best-effort
  }
}

async function runBundled(relPath, { autoOpen = false } = {}) {
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

  const env = { ...process.env, LANDSRAAD_PKG_ROOT: repoRoot };
  if (autoOpen) {
    const requested = Number.parseInt(env.PORT ?? '', 10);
    const start = Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_PORT;
    try {
      const chosen = await findFreePort(start, PORT_SCAN_RANGE);
      if (chosen !== start) {
        console.error(`Port ${start} in use, using ${chosen} instead.`);
      }
      env.PORT = String(chosen);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  const stdio = autoOpen ? ['inherit', 'pipe', 'inherit'] : 'inherit';

  const child = spawn(process.execPath, [entry, ...rest], {
    stdio,
    env,
    cwd: process.cwd()
  });

  if (autoOpen && child.stdout) {
    let opened = false;
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      if (opened) return;
      const text = chunk.toString();
      const match = text.match(/Listening on\s+(https?:\/\/\S+)/i);
      if (match) {
        opened = true;
        const raw = match[1];
        const url = raw.replace(/^https?:\/\/(0\.0\.0\.0|\[::\]|\[::0\])/i, (m) =>
          m.replace(/(0\.0\.0\.0|\[::\]|\[::0\])/i, 'localhost')
        );
        openInBrowser(url);
      }
    });
  }

  child.on('exit', (code) => process.exit(code ?? 0));
}

let task;
if (sub === 'init') {
  task = runBundled('build/cli/template-install.mjs');
} else if (sub === 'export') {
  task = runBundled('build/cli/template-export.mjs');
} else if (sub === 'reset') {
  task = runBundled('build/cli/reset.mjs');
} else {
  task = runBundled('build/index.js', { autoOpen: true });
}

task.catch((err) => {
  console.error(err);
  process.exit(1);
});
