import { createServer } from 'node:net';

function probePort(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    try {
      srv.listen(port, '0.0.0.0');
    } catch {
      resolve(false);
    }
  });
}

export async function findFreePort(start, max = 100) {
  const begin = Number(start);
  if (!Number.isInteger(begin) || begin < 1 || begin > 65535) {
    throw new RangeError(`invalid start port: ${start}`);
  }
  const limit = Math.min(begin + max, 65536);
  for (let p = begin; p < limit; p++) {
    if (await probePort(p)) return p;
  }
  throw new Error(`No free port in [${begin}, ${limit})`);
}
