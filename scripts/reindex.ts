import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { listCouncillors } from '../src/lib/server/councillors';
import { listJobs } from '../src/lib/server/jobs';
import { listNotes } from '../src/lib/server/memory';
import { councilDir, councillorDir, jobDir, memoryDir } from '../src/lib/server/paths';
import { closeAll, indexUpsert, setEmbedder } from '../src/lib/server/indexer';
import { xenovaEmbedder } from '../src/lib/server/embedder-xenova';
import type { ChunkKind } from '../src/lib/server/embeddings';

interface Target {
  kind: ChunkKind;
  ref_id: string;
  path: string;
  title: string | null;
  councillor_slug: string | null;
}

async function fileMtime(path: string): Promise<string> {
  return (await stat(path)).mtime.toISOString();
}

async function collectMemory(councilSlug: string): Promise<Target[]> {
  const notes = await listNotes(councilSlug);
  return notes.map((n) => ({
    kind: 'memory',
    ref_id: n.slug,
    path: join(memoryDir(councilSlug), `${n.slug}.md`),
    title: n.title,
    councillor_slug: null
  }));
}

async function collectPersonas(councilSlug: string): Promise<Target[]> {
  const cs = await listCouncillors(councilSlug);
  const targets: Target[] = [];
  for (const c of cs) {
    const p = join(councillorDir(councilSlug, c.slug), 'persona.md');
    if (existsSync(p)) {
      targets.push({
        kind: 'persona',
        ref_id: c.slug,
        path: p,
        title: c.name,
        councillor_slug: c.slug
      });
    }
  }
  return targets;
}

async function collectJobs(councilSlug: string): Promise<Target[]> {
  const jobs = await listJobs(councilSlug);
  const targets: Target[] = [];
  const kinds: Array<{ kind: ChunkKind; file: string }> = [
    { kind: 'job_input', file: 'input.md' },
    { kind: 'job_output', file: 'output.md' },
    { kind: 'transcript', file: 'transcript.md' }
  ];
  for (const j of jobs) {
    for (const { kind, file } of kinds) {
      const p = join(jobDir(councilSlug, j.id), file);
      if (!existsSync(p)) continue;
      const sz = (await stat(p)).size;
      if (sz === 0) continue;
      targets.push({
        kind,
        ref_id: j.id,
        path: p,
        title: j.title,
        councillor_slug: j.councillor_slug
      });
    }
  }
  return targets;
}

async function reindex(councilSlug: string): Promise<void> {
  if (!existsSync(councilDir(councilSlug))) {
    console.error(`Council "${councilSlug}" not found at ${councilDir(councilSlug)}`);
    process.exit(1);
  }

  console.log(`Reindexing council: ${councilSlug}`);
  setEmbedder(xenovaEmbedder());

  const targets = [
    ...(await collectMemory(councilSlug)),
    ...(await collectPersonas(councilSlug)),
    ...(await collectJobs(councilSlug))
  ];

  console.log(`  ${targets.length} document(s) to consider`);

  let indexed = 0;
  let skipped = 0;
  for (const t of targets) {
    const text = await readFile(t.path, 'utf8');
    if (!text.trim()) {
      skipped++;
      continue;
    }
    const mtime = await fileMtime(t.path);
    await indexUpsert(councilSlug, {
      kind: t.kind,
      ref_id: t.ref_id,
      text,
      source_path: t.path,
      source_mtime: mtime,
      title: t.title,
      councillor_slug: t.councillor_slug
    });
    indexed++;
    if (indexed % 10 === 0) console.log(`  ${indexed}/${targets.length}`);
  }

  closeAll();
  console.log(`Done. Indexed ${indexed}, skipped ${skipped} (empty).`);
}

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: npm run reindex -- <council-slug>');
  process.exit(1);
}

reindex(slug).catch((err) => {
  console.error(err);
  process.exit(1);
});
