import pkg from '../../../package.json' with { type: 'json' };

type JsonSchema = Record<string, unknown>;

interface Response {
  description: string;
  content?: Record<string, { schema: JsonSchema }>;
}

interface Operation {
  summary: string;
  description?: string;
  operationId: string;
  tags?: string[];
  responses: Record<string, Response>;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
}

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, PathItem>;
  components?: { schemas?: Record<string, JsonSchema> };
}

export function buildOpenApiSpec(): OpenApiSpec {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Landsraad API',
      version: pkg.version,
      description:
        'JSON API surface for the Landsraad app. The bulk of Landsraad is server-rendered SvelteKit pages with form actions; this document covers only the machine-readable `/api/*` endpoints.'
    },
    paths: {
      '/api/instances': {
        get: {
          summary: 'List running Landsraad instances',
          description:
            'Returns every Landsraad process this user has registered in `~/.landsraad/instances.json` (override via `LANDSRAAD_INSTANCES_FILE`). Stale entries for dead PIDs are pruned on read.',
          operationId: 'listInstances',
          tags: ['instances'],
          responses: {
            '200': {
              description: 'Live instance registry.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/InstancesResponse' }
                }
              }
            }
          }
        }
      },
      '/api/openapi.json': {
        get: {
          summary: 'This OpenAPI document',
          description: 'Returns the OpenAPI 3.1 description of the Landsraad JSON API.',
          operationId: 'getOpenApiSpec',
          tags: ['meta'],
          responses: {
            '200': {
              description: 'OpenAPI 3.1 document describing the Landsraad JSON API.',
              content: {
                'application/json': {
                  schema: { type: 'object' }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        Instance: {
          type: 'object',
          required: ['pid', 'port', 'cwd', 'startedAt'],
          properties: {
            pid: { type: 'integer', description: 'OS process id of the Landsraad server.' },
            port: {
              type: ['integer', 'null'],
              description: 'HTTP port the instance is listening on, or null if not yet bound.'
            },
            cwd: { type: 'string', description: 'Council root directory the instance is serving.' },
            startedAt: {
              type: 'string',
              format: 'date-time',
              description: 'ISO-8601 UTC timestamp the instance was registered.'
            }
          }
        },
        InstancesResponse: {
          type: 'object',
          required: ['instances'],
          properties: {
            instances: {
              type: 'array',
              items: { $ref: '#/components/schemas/Instance' }
            }
          }
        }
      }
    }
  };
}
