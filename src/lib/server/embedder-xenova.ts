import type { Embedder } from './embeddings';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;

let pipelineP: Promise<unknown> | null = null;

async function getPipeline(): Promise<(text: string, opts: unknown) => Promise<{ data: Float32Array }>> {
  if (!pipelineP) {
    pipelineP = (async () => {
      const mod = await import('@xenova/transformers');
      return await mod.pipeline('feature-extraction', MODEL);
    })();
  }
  return (await pipelineP) as (
    text: string,
    opts: unknown
  ) => Promise<{ data: Float32Array }>;
}

export function xenovaEmbedder(): Embedder {
  return {
    dim: DIM,
    async embed(texts: string[]): Promise<Float32Array[]> {
      const pipe = await getPipeline();
      const out: Float32Array[] = [];
      for (const text of texts) {
        const result = await pipe(text, { pooling: 'mean', normalize: true });
        out.push(new Float32Array(result.data));
      }
      return out;
    }
  };
}
