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
      '/api/council': {
        get: {
          summary: 'This council identity and live roster',
          description:
            'Returns the slug, name, and live councillor roster for this council. Used by peer councils during cross-council meeting discovery.',
          operationId: 'getCouncil',
          tags: ['council'],
          responses: {
            '200': {
              description: 'Council identity and councillor roster.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CouncilResponse' }
                }
              }
            }
          }
        }
      },
      '/api/peers': {
        get: {
          summary: 'Discover peer councils running on this machine',
          description:
            'Returns all other Landsraad instances running on this machine (self excluded, unreachable instances dropped). Each entry includes the peer council identity and its live councillor roster. Discovery is performed via the shared instance registry and `/api/council` on each peer.',
          operationId: 'listPeers',
          tags: ['council'],
          responses: {
            '200': {
              description: 'List of reachable peer councils.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PeersResponse' }
                }
              }
            }
          }
        }
      },
      '/api/meeting/turn': {
        post: {
          summary: 'Run a single councillor turn (loopback-only)',
          description:
            'Invoked by a host council to summon a councillor on this council for one meeting turn. **Loopback-only**: non-loopback callers receive 403. Returns the turn text on success, or an error envelope on failure.',
          operationId: 'postMeetingTurn',
          tags: ['meeting'],
          responses: {
            '200': {
              description: 'Turn completed (ok or failed envelope).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TurnResponse' }
                }
              }
            },
            '400': {
              description: 'Bad request — missing/oversized/path-traversal identifiers.'
            },
            '403': {
              description: 'Forbidden — caller is not a loopback address.'
            },
            '404': {
              description: 'Councillor not found on this council.'
            },
            '409': {
              description: 'Conflict — councillor is currently busy.'
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
        },
        CouncillorInfo: {
          type: 'object',
          required: ['slug', 'label', 'adapter', 'busy'],
          properties: {
            slug: { type: 'string', description: 'Councillor slug.' },
            label: { type: 'string', description: 'Display name.' },
            adapter: { type: 'string', description: 'Adapter string (e.g. "cli:claude").' },
            busy: { type: 'boolean', description: 'True if the councillor is currently running a job or in a meeting.' }
          }
        },
        CouncilResponse: {
          type: 'object',
          required: ['slug', 'name', 'councillors'],
          properties: {
            slug: { type: 'string', description: 'Council slug.' },
            name: { type: 'string', description: 'Council display name.' },
            councillors: {
              type: 'array',
              items: { $ref: '#/components/schemas/CouncillorInfo' }
            }
          }
        },
        Peer: {
          type: 'object',
          required: ['council_slug', 'name', 'cwd', 'port', 'councillors'],
          properties: {
            council_slug: { type: 'string', description: 'Slug of the peer council.' },
            name: { type: 'string', description: 'Display name of the peer council.' },
            cwd: { type: 'string', description: 'Filesystem path of the peer council root.' },
            port: { type: 'integer', description: 'HTTP port the peer instance is listening on.' },
            councillors: {
              type: 'array',
              items: { $ref: '#/components/schemas/CouncillorInfo' }
            }
          }
        },
        PeersResponse: {
          type: 'object',
          required: ['peers'],
          properties: {
            peers: {
              type: 'array',
              items: { $ref: '#/components/schemas/Peer' }
            }
          }
        },
        TurnResponse: {
          type: 'object',
          required: ['ok'],
          properties: {
            ok: { type: 'boolean' },
            text: { type: 'string', description: 'Turn text (present when ok is true).' },
            duration_ms: { type: 'integer', description: 'Wall-clock time for the adapter call.' },
            exit_code: { type: 'integer', description: 'Adapter exit code (present when ok is false).' },
            detail: { type: 'string', description: 'Error detail (present when ok is false).' }
          }
        }
      }
    }
  };
}
