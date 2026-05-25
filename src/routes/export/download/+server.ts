import { exportSelection } from '$lib/server/templates';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim() || 'untitled';
  const version = String(form.get('version') ?? '').trim() || '0.1.0';
  const description = String(form.get('description') ?? '').trim() || undefined;
  const author = String(form.get('author') ?? '').trim() || undefined;
  const license = String(form.get('license') ?? '').trim() || undefined;
  const councillor_slugs = form.getAll('councillors').map(String);
  const memory_slugs = form.getAll('memory').map(String);
  const sample_job_ids = form.getAll('jobs').map(String);

  const template = await exportSelection({
    council: { name, version, description, author, license },
    councillor_slugs,
    memory_slugs,
    sample_job_ids
  });
  const body = JSON.stringify(template, null, 2) + '\n';
  const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.template.json`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
};
