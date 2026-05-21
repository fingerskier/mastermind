import { existsSync } from 'node:fs';
import { createCouncil, readCouncil } from '../src/lib/server/councils';
import { createCouncillor, listCouncillors } from '../src/lib/server/councillors';
import { createNote, listNotes } from '../src/lib/server/memory';
import { createJob, listJobs } from '../src/lib/server/jobs';
import { councilDir } from '../src/lib/server/paths';

const COUNCIL_SLUG = 'dogfood';
const COUNCIL_NAME = 'Dogfood';

async function main(): Promise<void> {
  const dir = councilDir(COUNCIL_SLUG);
  if (!existsSync(dir)) {
    await createCouncil({
      name: COUNCIL_NAME,
      description: 'Built-in council used to exercise Landsraad locally.'
    });
    console.log(`Created council at ${dir}`);
  } else {
    await readCouncil(COUNCIL_SLUG);
    console.log(`Council already exists at ${dir}`);
  }

  const existing = new Set((await listCouncillors(COUNCIL_SLUG)).map((c) => c.slug));
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
    await createCouncillor(COUNCIL_SLUG, c);
    console.log(`+ councillor: ${c.name}`);
  }

  const noteTitles = new Set((await listNotes(COUNCIL_SLUG)).map((n) => n.title.toLowerCase()));
  if (!noteTitles.has('house rules')) {
    await createNote(COUNCIL_SLUG, {
      title: 'House Rules',
      body: '- Be concise.\n- Cite assumptions explicitly.\n- Never invent facts about the user.\n'
    });
    console.log('+ memory note: House Rules');
  }

  const jobs = await listJobs(COUNCIL_SLUG);
  if (jobs.length === 0) {
    const j = await createJob(COUNCIL_SLUG, {
      title: 'Hello world',
      brief: 'Greet the council in one short paragraph.',
      councillor_slug: 'mocky'
    });
    console.log(`+ sample job: ${j.id}`);
  }

  console.log('\nDone. Start the app with `npm run dev` and visit /councils/dogfood.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
