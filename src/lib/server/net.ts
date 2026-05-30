/** True for IPv4 127.0.0.0/8, IPv6 ::1, and IPv4-mapped loopback. */
export function isLoopbackAddress(addr: string): boolean {
  if (!addr) return false;
  if (addr === '::1') return true;
  const mapped = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(mapped);
}
