import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

interface Args {
  source: string;
  target?: string;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { source: '', yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--target' || a === '-t') args.target = argv[++i];
    else if (!args.source) args.source = a;
    else throw new Error(`Unexpected extra arg: ${a}`);
  }
  if (!args.source) {
    throw new Error('Usage: landsraad init <url-or-path> [--target <dir>] [--yes]');
  }
  return args;
}

function describePlan(plan: import('../src/lib/server/templates').ApplyPlan): string {
  const lines: string[] = [];
  if (plan.council.exists && plan.council.willOverwrite) {
    lines.push('~ council meta will be replaced');
  } else if (!plan.council.exists) {
    lines.push('+ create council');
  }
  for (const s of plan.councillors.add) lines.push(`+ councillor: ${s}`);
  for (const s of plan.councillors.overwrite) lines.push(`~ councillor (overwrite): ${s}`);
  for (const s of plan.memory.add) lines.push(`+ memory note: ${s}`);
  for (const s of plan.memory.overwrite) lines.push(`~ memory note (overwrite): ${s}`);
  if (plan.sample_jobs.skipped_because_jobs_exist) {
    lines.push('• sample_jobs: skipped (jobs/ already non-empty)');
  } else if (plan.sample_jobs.add > 0) {
    lines.push(`+ sample jobs: ${plan.sample_jobs.add}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.target) {
    const abs = resolve(process.cwd(), args.target);
    if (!existsSync(abs)) await mkdir(abs, { recursive: true });
    process.env.LANDSRAAD_COUNCIL_ROOT = abs;
  }

  const { loadTemplate, planApply, applyTemplate, TemplateNeedsConfirmation } =
    await import('../src/lib/server/templates');

  const t = await loadTemplate(args.source);
  const plan = await planApply(t);
  const requiresConfirm =
    plan.council.willOverwrite ||
    plan.councillors.overwrite.length > 0 ||
    plan.memory.overwrite.length > 0;

  console.log(`Template: ${t.name}@${t.version}`);
  console.log(describePlan(plan));

  if (requiresConfirm && !args.yes) {
    const rl = createInterface({ input, output });
    const ans = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
    rl.close();
    if (ans !== 'y' && ans !== 'yes') {
      console.log('Aborted.');
      process.exit(1);
    }
  }

  try {
    await applyTemplate(t, { confirmedOverwrite: requiresConfirm });
  } catch (err) {
    if (err instanceof TemplateNeedsConfirmation) {
      console.error('Confirmation required but not provided.');
      process.exit(2);
    }
    throw err;
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
