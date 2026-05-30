#!/usr/bin/env node
// Entry point for `npx landsraad`.
//   landsraad                    -> start production SvelteKit server
//   landsraad init <source> ...  -> install a council template
//   landsraad export <out> ...   -> export the current council to a template

import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { findFreePort } from './find-port.js';
import { writeInstance, removeInstance } from './registry.js';
import { formatStartupDiag } from './diag.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

function readPkgVersion() {
  try {
    const data = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    return typeof data?.version === 'string' ? data.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const DEFAULT_PORT = 10191;
const PORT_SCAN_RANGE = 100;

const [, , sub, ...rest] = process.argv;

function readCouncilName(cwd) {
  try {
    const file = resolve(cwd, 'council.json');
    if (!existsSync(file)) return null;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    return name || null;
  } catch {
    return null;
  }
}

function setTerminalTitle(title) {
  if (!title) return;
  if (!process.stdout.isTTY) return;
  try {
    // OSC 0: set window + icon title. Works on Windows Terminal, PowerShell,
    // modern cmd (VT), xterm, iTerm, etc.
    process.stdout.write(`\x1b]0;${title}\x07`);
  } catch {
    // best-effort
  }
}

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

async function runBundled(relPath, { autoOpen = false, diag = null } = {}) {
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

  if (diag) {
    const portNum = Number.parseInt(env.PORT ?? '', 10);
    const port = Number.isInteger(portNum) ? portNum : null;
    const lines = formatStartupDiag({
      ...diag,
      port,
      url: port != null ? `http://localhost:${port}` : undefined,
      pid: child.pid,
      node: process.version,
      version: readPkgVersion()
    });
    console.error(lines.join('\n'));
  }

  let registered = false;
  const cleanup = async () => {
    if (!registered) return;
    registered = false;
    try {
      await removeInstance(child.pid);
    } catch {
      // best-effort
    }
  };

  if (autoOpen) {
    const onSignal = () => {
      try {
        child.kill();
      } catch {
        // ignore
      }
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  }

  if (autoOpen && child.stdout) {
    let opened = false;
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      const text = chunk.toString();
      if (!registered) {
        const listenMatch = text.match(/Listening on\s+(https?:\/\/\S+)/i);
        if (listenMatch) {
          registered = true;
          const portNum = Number.parseInt(env.PORT ?? '', 10);
          writeInstance({
            pid: child.pid,
            port: Number.isInteger(portNum) ? portNum : null,
            cwd: process.cwd(),
            startedAt: new Date().toISOString()
          }).catch(() => {
            // best-effort registry write
          });
        }
      }
      if (opened) return;
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

  child.on('exit', async (code) => {
    await cleanup();
    process.exit(code ?? 0);
  });
}

let task;
if (sub === 'init') {
  task = runBundled('build/cli/template-install.mjs');
} else if (sub === 'export') {
  task = runBundled('build/cli/template-export.mjs');
} else if (sub === 'reset') {
  task = runBundled('build/cli/reset.mjs');
} else {
  const cwd = process.cwd();
  const explicitName = readCouncilName(cwd);
  const councilName = explicitName ?? basename(cwd);
  const configPath = resolve(cwd, 'council.json');
  setTerminalTitle(`${councilName} — Landsraad`);
  task = runBundled('build/index.js', {
    autoOpen: true,
    diag: {
      councilName,
      cwd,
      configPath,
      configExists: existsSync(configPath)
    }
  });
}

task.catch((err) => {
  console.error(err);
  process.exit(1);
});
