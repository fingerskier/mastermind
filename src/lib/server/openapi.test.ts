import { describe, it, expect } from 'vitest';
import { buildOpenApiSpec } from './openapi';

describe('buildOpenApiSpec', () => {
  const spec = buildOpenApiSpec();

  it('declares OpenAPI 3.1', () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
  });

  it('has info with title and version', () => {
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBeTruthy();
  });

  it('documents GET /api/instances', () => {
    const op = spec.paths['/api/instances']?.get;
    expect(op).toBeDefined();
    expect(op!.responses['200']).toBeDefined();
    const schemaRef = (op!.responses['200'] as any).content['application/json'].schema.$ref;
    expect(schemaRef).toBe('#/components/schemas/InstancesResponse');
  });

  it('documents GET /api/openapi.json (self)', () => {
    const op = spec.paths['/api/openapi.json']?.get;
    expect(op).toBeDefined();
    expect(op!.responses['200']).toBeDefined();
  });

  it('defines Instance + InstancesResponse component schemas', () => {
    const schemas = spec.components?.schemas ?? {};
    expect(schemas.Instance).toBeDefined();
    expect(schemas.InstancesResponse).toBeDefined();
    const inst: any = schemas.Instance;
    expect(inst.type).toBe('object');
    expect(inst.required).toEqual(expect.arrayContaining(['pid', 'port', 'cwd', 'startedAt']));
  });

  it('is JSON-serializable', () => {
    expect(() => JSON.stringify(spec)).not.toThrow();
  });
});
