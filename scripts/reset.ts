import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

interface Args {
  target?: string;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--target' || a === '-t') args.target = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: landsraad reset [--target <dir>] [--yes]');
      console.log('Wipes council.json, councillors/, memory/, jobs/, proposals/, .index/.');
      process.exit(0);
    } else throw new Error(`Unexpected arg: ${a}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.target) {
    process.env.LANDSRAAD_COUNCIL_ROOT = resolve(process.cwd(), args.target);
  }

  const { councilRoot } = await import('../src/lib/server/paths');
  const { hasCouncil, deleteCouncilData } = await import('../src/lib/server/councils');

  const root = councilRoot();
  const hadCouncil = hasCouncil();

  console.log(`This will PERMANENTLY DELETE the council and ALL its data in:`);
  console.log(`  ${root}`);
  console.log('');
  console.log('Removed:');
  console.log('  council.json, councillors/, memory/, jobs/, proposals/, .index/');
  if (!hadCouncil) {
    console.log('');
    console.log('(No council.json found — stray subdirs will still be removed.)');
  }

  if (!args.yes) {
    const rl = createInterface({ input, output });
    const ans = (await rl.question('\nType "reset" to confirm: ')).trim();
    rl.close();
    if (ans !== 'reset') {
      console.log('Aborted.');
      process.exit(1);
    }
  }

  await deleteCouncilData();
  console.log('Done. Council wiped.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
