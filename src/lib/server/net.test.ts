import { describe, it, expect } from 'vitest';
import { isLoopbackAddress } from './net';

describe('isLoopbackAddress', () => {
  it('accepts IPv4 loopback', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.5.6.7')).toBe(true);
  });
  it('accepts IPv6 loopback and mapped form', () => {
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });
  it('rejects non-loopback', () => {
    expect(isLoopbackAddress('192.168.1.10')).toBe(false);
    expect(isLoopbackAddress('10.0.0.5')).toBe(false);
    expect(isLoopbackAddress('')).toBe(false);
    expect(isLoopbackAddress('example.com')).toBe(false);
  });
});
