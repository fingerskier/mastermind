import { fail, redirect } from '@sveltejs/kit';
import {
  applyTemplate,
  listBundledTemplates,
  loadTemplate,
  parseTemplate,
  TemplateFetchError,
  TemplateNeedsConfirmation,
  TemplateParseError,
  TemplateValidationError,
  type ApplyPlan,
  type CouncilTemplate
} from '$lib/server/templates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return { bundled: await listBundledTemplates() };
};

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

async function readFormSource(formData: FormData): Promise<CouncilTemplate> {
  const source = String(formData.get('source') ?? '').trim();
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new TemplateFetchError(`Uploaded file exceeds 2 MB cap (${file.size} bytes).`);
    }
    const text = await file.text();
    return parseTemplate(text);
  }
  if (!source) throw new TemplateValidationError('Provide a URL, path, or upload a file.');
  return loadTemplate(source);
}

function errorMessage(err: unknown): string {
  if (
    err instanceof TemplateFetchError ||
    err instanceof TemplateParseError ||
    err instanceof TemplateValidationError
  ) {
    return err.message;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

export const actions: Actions = {
  preview: async ({ request }) => {
    const form = await request.formData();
    let t: CouncilTemplate;
    try {
      t = await readFormSource(form);
    } catch (err) {
      return fail(400, {
        error: errorMessage(err),
        source: String(form.get('source') ?? '')
      });
    }
    const { planApply } = await import('$lib/server/templates');
    const plan: ApplyPlan = await planApply(t);
    return {
      preview: true as const,
      plan,
      template: t,
      templateJson: JSON.stringify(t),
      summary: `${t.name}@${t.version}`
    };
  },

  apply: async ({ request }) => {
    const form = await request.formData();
    const json = String(form.get('templateJson') ?? '');
    if (!json) return fail(400, { error: 'Missing template JSON on confirm.' });
    let t: CouncilTemplate;
    try {
      t = parseTemplate(json);
    } catch (err) {
      return fail(400, { error: errorMessage(err) });
    }
    try {
      await applyTemplate(t, { confirmedOverwrite: true });
    } catch (err) {
      if (err instanceof TemplateNeedsConfirmation) {
        return fail(400, { error: 'Confirmation lost; please re-preview.' });
      }
      return fail(500, { error: errorMessage(err) });
    }
    throw redirect(303, '/');
  }
};
