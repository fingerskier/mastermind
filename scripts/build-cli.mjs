import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const entries = [
  { in: 'scripts/template-install.ts', out: 'build/cli/template-install.mjs' },
  { in: 'scripts/template-export.ts', out: 'build/cli/template-export.mjs' },
  { in: 'scripts/reset.ts', out: 'build/cli/reset.mjs' }
];

await Promise.all(
  entries.map((e) =>
    build({
      entryPoints: [resolve(repoRoot, e.in)],
      outfile: resolve(repoRoot, e.out),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      external: ['better-sqlite3', 'sqlite-vec', '@xenova/transformers'],
      banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
      logLevel: 'info'
    })
  )
);
