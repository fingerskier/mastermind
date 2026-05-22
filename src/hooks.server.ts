import { env } from 'node:process';
import { xenovaEmbedder } from '$lib/server/embedder-xenova';
import { setEmbedder } from '$lib/server/indexer';

if (env.LANDSRAAD_EMBED !== '0') {
  try {
    setEmbedder(xenovaEmbedder());
    console.log('[landsraad] embedder ready (Xenova/all-MiniLM-L6-v2)');
  } catch (err) {
    console.warn('[landsraad] embedder init failed; search disabled:', (err as Error).message);
  }
}
