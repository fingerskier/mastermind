const DIMENSIONS = 384
const CHAR_NGRAM_SIZES = [3, 4, 5]
const WORD_NGRAM_SIZES = [1, 2]

export function createHashEmbedder() {
  return {
    id: 'local-hash-ngram',
    dimensions: DIMENSIONS,
    async embed(text) {
      return embedText(text)
    },
  }
}

function embedText(text) {
  const vector = new Float64Array(DIMENSIONS)

  for (const ngram of extractCharNgrams(text)) {
    vector[hashToIndex(ngram)] += hashToSign(ngram)
  }

  for (const ngram of extractWordNgrams(text)) {
    const key = `w:${ngram}`
    vector[hashToIndex(key)] += hashToSign(key) * 2
  }

  normalize(vector)
  return Array.from(vector)
}

function extractCharNgrams(text) {
  const lower = text.toLowerCase()
  const ngrams = []
  for (const size of CHAR_NGRAM_SIZES) {
    for (let i = 0; i <= lower.length - size; i++) {
      ngrams.push(lower.slice(i, i + size))
    }
  }
  return ngrams
}

function extractWordNgrams(text) {
  const words = tokenize(text)
  const ngrams = []
  for (const size of WORD_NGRAM_SIZES) {
    for (let i = 0; i <= words.length - size; i++) {
      ngrams.push(words.slice(i, i + size).join(' '))
    }
  }
  return ngrams
}

export function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_.$/-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
}

function hashCode(text) {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return hash
}

function hashToIndex(text) {
  const hash = hashCode(text)
  return ((hash % DIMENSIONS) + DIMENSIONS) % DIMENSIONS
}

function hashToSign(text) {
  return (hashCode(`${text}:sign`) & 1) === 0 ? 1 : -1
}

function normalize(vector) {
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm)
  if (norm === 0) return
  for (let i = 0; i < vector.length; i++) vector[i] /= norm
}
