import { env } from 'node:process';
import type { Handle } from '@sveltejs/kit';
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

const SILENT_PROBES = new Set([
  '/sw.js',
  '/.well-known/appspecific/com.chrome.devtools.json'
]);

export const handle: Handle = async ({ event, resolve }) => {
  if (SILENT_PROBES.has(event.url.pathname)) {
    return new Response(null, { status: 204 });
  }
  return resolve(event);
};
