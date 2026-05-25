import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

interface Args {
  out: string;
  all: boolean;
  councillorsOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: '', all: false, councillorsOnly: false };
  for (const a of argv) {
    if (a === '--') continue;
    if (a === '--all') args.all = true;
    else if (a === '--councillors-only') args.councillorsOnly = true;
    else if (!args.out) args.out = a;
    else throw new Error(`Unexpected extra arg: ${a}`);
  }
  if (!args.out) {
    throw new Error('Usage: landsraad export <out.json> [--all | --councillors-only]');
  }
  return args;
}

async function pick<T extends { id?: string; slug?: string; title?: string; name?: string }>(
  rl: import('node:readline/promises').Interface,
  label: string,
  items: T[],
  idKey: 'id' | 'slug',
  defaultIncluded: boolean
): Promise<string[]> {
  if (items.length === 0) return [];
  console.log(`\n${label}:`);
  items.forEach((it, i) => {
    const id = (it as Record<string, string>)[idKey];
    const display = it.name ?? it.title ?? id;
    console.log(`  [${i + 1}] ${display} (${id})`);
  });
  const prompt = defaultIncluded
    ? 'Include which? (comma-separated indexes, "all", or blank to include all): '
    : 'Include which? (comma-separated indexes, "all", or blank to skip): ';
  const ans = (await rl.question(prompt)).trim();
  if (ans === '' && defaultIncluded) return items.map((it) => (it as Record<string, string>)[idKey]);
  if (ans === '') return [];
  if (ans.toLowerCase() === 'all') return items.map((it) => (it as Record<string, string>)[idKey]);
  const idxs = ans.split(',').map((s) => parseInt(s.trim(), 10) - 1);
  return idxs.filter((i) => i >= 0 && i < items.length).map((i) => (items[i] as Record<string, string>)[idKey]);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { listCouncillors } = await import('../src/lib/server/councillors');
  const { listNotes } = await import('../src/lib/server/memory');
  const { listJobs } = await import('../src/lib/server/jobs');
  const { exportSelection } = await import('../src/lib/server/templates');

  const [councillors, notes, jobs] = await Promise.all([
    listCouncillors(),
    listNotes(),
    listJobs()
  ]);
  const queued = jobs.filter((j) => j.status === 'queued');

  let councillorSlugs: string[];
  let memorySlugs: string[];
  let jobIds: string[];
  let meta: { name: string; version: string; description?: string; author?: string; license?: string };

  if (args.all || args.councillorsOnly) {
    councillorSlugs = councillors.map((c) => c.slug);
    memorySlugs = args.all ? notes.map((n) => n.slug) : [];
    jobIds = args.all ? queued.map((j) => j.id) : [];
    meta = { name: 'untitled', version: '0.1.0' };
  } else {
    const rl = createInterface({ input, output });
    meta = {
      name: (await rl.question('Template name: ')).trim() || 'untitled',
      version: (await rl.question('Version (e.g. 0.1.0): ')).trim() || '0.1.0',
      description: (await rl.question('Description (optional): ')).trim() || undefined,
      author: (await rl.question('Author (optional): ')).trim() || undefined,
      license: (await rl.question('License (optional): ')).trim() || undefined
    };
    councillorSlugs = await pick(rl, 'Councillors', councillors, 'slug', true);
    memorySlugs = await pick(rl, 'Memory notes', notes, 'slug', false);
    jobIds = await pick(rl, 'Queued sample jobs', queued, 'id', false);
    rl.close();
  }

  const template = await exportSelection({
    council: meta,
    councillor_slugs: councillorSlugs,
    memory_slugs: memorySlugs,
    sample_job_ids: jobIds
  });

  const outPath = resolve(process.cwd(), args.out);
  await writeFile(outPath, JSON.stringify(template, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
