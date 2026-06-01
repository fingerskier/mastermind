/** Compact relative time, e.g. "3m ago", "in 2h", "5d ago". */
export function relTime(iso: string, now: number = Date.now()): string {
  const diffMs = new Date(iso).getTime() - now;
  const abs = Math.abs(diffMs);
  const future = diffMs >= 0;
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);
  const min = Math.round(abs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return fmt(min, 'm');
  const hr = Math.round(abs / 3_600_000);
  if (hr < 48) return fmt(hr, 'h');
  const days = Math.round(abs / 86_400_000);
  return fmt(days, 'd');
}
