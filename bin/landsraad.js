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

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const DEFAULT_PORT = '10191';

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

function runBundled(relPath, { autoOpen = false } = {}) {
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
  if (autoOpen && !env.PORT) env.PORT = DEFAULT_PORT;

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

if (sub === 'init') {
  runBundled('build/cli/template-install.mjs');
} else if (sub === 'export') {
  runBundled('build/cli/template-export.mjs');
} else if (sub === 'reset') {
  runBundled('build/cli/reset.mjs');
} else {
  runBundled('build/index.js', { autoOpen: true });
}
