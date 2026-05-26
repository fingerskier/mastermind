import { Cron } from 'croner';

function tryParse(expr: string): Cron | null {
  try {
    return new Cron(expr);
  } catch {
    return null;
  }
}

export function validateCron(expr: string): boolean {
  if (typeof expr !== 'string' || !expr.trim()) return false;
  if (expr.trim().split(/\s+/).length !== 5) return false;
  return tryParse(expr.trim()) !== null;
}

export function nextFire(expr: string, after: Date): string | null {
  const c = tryParse(expr);
  if (!c) return null;
  const d = c.nextRun(after);
  return d ? d.toISOString() : null;
}

export function previewNext(expr: string, count: number, after: Date): string[] {
  const c = tryParse(expr);
  if (!c) return [];
  const out: string[] = [];
  let cursor = after;
  for (let i = 0; i < count; i++) {
    const d = c.nextRun(cursor);
    if (!d) break;
    out.push(d.toISOString());
    cursor = new Date(d.getTime() + 1);
  }
  return out;
}
