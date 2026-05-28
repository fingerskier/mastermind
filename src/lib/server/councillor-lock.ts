export type LockHolder =
  | { kind: 'job'; id: string }
  | { kind: 'meeting'; id: string };

const slots = new Map<string, LockHolder>();

function eq(a: LockHolder, b: LockHolder): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function tryAcquire(slug: string, holder: LockHolder): boolean {
  if (slots.has(slug)) return false;
  slots.set(slug, holder);
  return true;
}

export function release(slug: string, holder: LockHolder): void {
  const existing = slots.get(slug);
  if (!existing) return;
  if (!eq(existing, holder)) return;
  slots.delete(slug);
}

export function current(slug: string): LockHolder | null {
  return slots.get(slug) ?? null;
}

export function listHeldBy(holder: LockHolder): string[] {
  const out: string[] = [];
  for (const [slug, h] of slots.entries()) {
    if (eq(h, holder)) out.push(slug);
  }
  return out;
}

export function _resetForTests(): void {
  slots.clear();
}
