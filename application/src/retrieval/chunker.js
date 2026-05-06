const DEFAULT_CHUNK_SIZE = 1200
const DEFAULT_OVERLAP = 160

export function chunkText(text, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = {}) {
  const chunks = []
  const lines = text.split(/\r?\n/)
  let current = ''

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line
    if (next.length > chunkSize && current.trim()) {
      chunks.push(current.trim())
      current = `${tailWords(current, overlap)}\n${line}`.trim()
    } else {
      current = next
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}

function tailWords(text, approximateChars) {
  const words = text.split(/\s+/).filter(Boolean)
  const keep = []
  let length = 0

  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i]
    length += word.length + 1
    keep.unshift(word)
    if (length >= approximateChars) break
  }

  return keep.join(' ')
}
