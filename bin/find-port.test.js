import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:net';
import { findFreePort } from './find-port.js';

const openServers = [];

function occupy(port) {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(port, '0.0.0.0', () => {
      openServers.push(srv);
      resolve(srv);
    });
  });
}

function closeAll() {
  return Promise.all(
    openServers.splice(0).map(
      (srv) => new Promise((resolve) => srv.close(() => resolve()))
    )
  );
}

afterEach(closeAll);

describe('findFreePort', () => {
  it('returns start when start is free', async () => {
    const start = 47100 + Math.floor(Math.random() * 200);
    const port = await findFreePort(start);
    expect(port).toBe(start);
  });

  it('increments past a taken port to the next free one', async () => {
    const start = 47400 + Math.floor(Math.random() * 200);
    await occupy(start);
    const port = await findFreePort(start);
    expect(port).toBeGreaterThan(start);
    // ensure result is actually bindable
    await occupy(port);
  });

  it('throws when no free port within max range', async () => {
    const start = 47700 + Math.floor(Math.random() * 200);
    await occupy(start);
    await expect(findFreePort(start, 1)).rejects.toThrow(/no free port/i);
  });
});
