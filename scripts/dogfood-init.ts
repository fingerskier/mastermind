import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const TARGET_REL = process.argv[2] ?? './dogfood';
const TARGET = resolve(process.cwd(), TARGET_REL);

// Route every server-side write into TARGET via the LANDSRAAD_COUNCIL_ROOT env var.
process.env.LANDSRAAD_COUNCIL_ROOT = TARGET;

const { hasCouncil, createCouncil } = await import('../src/lib/server/councils');
const { createCouncillor, listCouncillors } = await import('../src/lib/server/councillors');
const { createNote, listNotes } = await import('../src/lib/server/memory');
const { createJob, listJobs } = await import('../src/lib/server/jobs');

async function main(): Promise<void> {
  if (!existsSync(TARGET)) await mkdir(TARGET, { recursive: true });

  if (!hasCouncil()) {
    await createCouncil({
      name: 'Dogfood',
      description: 'Built-in council used to exercise Landsraad locally.'
    });
    console.log(`Created council at ${TARGET}`);
  } else {
    console.log(`Council already exists at ${TARGET}`);
  }

  const existing = new Set((await listCouncillors()).map((c) => c.slug));
  const seeds = [
    {
      name: 'Mocky',
      role: 'Echo test councillor',
      adapter: 'mock:local',
      persona: 'You are Mocky, a mock councillor that simply echoes its prompt back. Useful for end-to-end verification.'
    },
    {
      name: 'Polly',
      role: 'Second mock councillor',
      adapter: 'mock:local',
      persona: 'You are Polly. You acknowledge requests succinctly and confirm receipt.'
    }
  ];
  for (const c of seeds) {
    if (existing.has(c.name.toLowerCase())) continue;
    await createCouncillor(c);
    console.log(`+ councillor: ${c.name}`);
  }

  const noteTitles = new Set((await listNotes()).map((n) => n.title.toLowerCase()));
  if (!noteTitles.has('house rules')) {
    await createNote({
      title: 'House Rules',
      body: '- Be concise.\n- Cite assumptions explicitly.\n- Never invent facts about the user.\n'
    });
    console.log('+ memory note: House Rules');
  }

  const jobs = await listJobs();
  if (jobs.length === 0) {
    const j = await createJob({
      title: 'Hello world',
      brief: 'Greet the council in one short paragraph.',
      councillor_slug: 'mocky'
    });
    console.log(`+ sample job: ${j.id}`);
  }

  console.log(`\nDone. To use this council, run:\n  cd ${TARGET_REL}\n  npx landsraad\n`);
  console.log(`Or for dev with LANDSRAAD_COUNCIL_ROOT=${TARGET_REL} npm run dev`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
