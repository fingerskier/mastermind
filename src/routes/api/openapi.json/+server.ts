import { json } from '@sveltejs/kit';
import { buildOpenApiSpec } from '$lib/server/openapi';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json(buildOpenApiSpec());
};
