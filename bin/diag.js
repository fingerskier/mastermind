// Pure helpers for the startup diagnostic banner printed by `npx landsraad`.

/**
 * Build the startup diagnostic banner as an array of lines.
 *
 * Pure: takes already-resolved values, returns strings. No I/O, no env reads,
 * so it can be unit-tested directly.
 *
 * @param {object} info
 * @param {string|null} info.councilName  council.json name, or null if unnamed
 * @param {string} info.cwd               council root (current working dir)
 * @param {string} info.configPath        absolute path to council.json
 * @param {boolean} info.configExists     whether council.json exists
 * @param {number|null} info.port         resolved listen port
 * @param {string} [info.url]             local URL (e.g. http://localhost:PORT)
 * @param {number} info.pid               child process pid
 * @param {string} info.node              node version (e.g. v20.11.0)
 * @param {string} info.version           landsraad package version
 * @returns {string[]}
 */
export function formatStartupDiag(info) {
  const {
    councilName,
    cwd,
    configPath,
    configExists,
    port,
    url,
    pid,
    node,
    version
  } = info;

  const rows = [
    ['Council', councilName ?? '(unnamed)'],
    ['Root', cwd],
    ['Config', configExists ? configPath : `${configPath} (missing)`]
  ];
  if (port != null) rows.push(['Port', String(port)]);
  if (url) rows.push(['URL', url]);
  if (pid != null) rows.push(['PID', String(pid)]);
  rows.push(['Node', node]);

  const width = Math.max(...rows.map(([label]) => label.length));
  const lines = [`Landsraad v${version}`];
  for (const [label, value] of rows) {
    lines.push(`  ${label.padEnd(width)}  ${value}`);
  }
  return lines;
}
