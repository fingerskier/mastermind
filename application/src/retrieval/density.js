import { gzipSync } from 'node:zlib'

export function informationDensity(text) {
  const originalBytes = Buffer.byteLength(text, 'utf8')
  if (originalBytes === 0) return 0
  return gzipSync(Buffer.from(text, 'utf8')).length / originalBytes
}
