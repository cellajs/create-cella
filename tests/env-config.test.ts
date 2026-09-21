import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateEnvConfigs, generateEnvFromExample, getBackendEnvReplacements } from '#/constants';

/**
 * Fast unit tests for the env generation helpers.
 * These do not require a full project install (unlike e2e.test.ts).
 */
describe('getBackendEnvReplacements', () => {
  it('includes docker-compose vars, db urls and admin email', () => {
    const r = getBackendEnvReplacements('my-app', 'admin@my-app.example.com', 0);

    // backend/.env is the single source of truth for docker compose vars (no root .env)
    expect(r.PROJECT_SLUG).toBe('my-app');
    expect(r.DB_PORT).toBe('5432');
    expect(r.DB_TEST_PORT).toBe('5434');
    expect(r.ADMIN_EMAIL).toBe('admin@my-app.example.com');
    expect(r.DATABASE_URL).toContain('@0.0.0.0:5432/');
    expect(r.DATABASE_ADMIN_URL).toContain('@0.0.0.0:5432/');
    expect(r.DATABASE_CDC_URL).toContain('@0.0.0.0:5432/');
  });

  it('applies the port offset to db ports and never emits PORT (devPorts governs services)', () => {
    const r = getBackendEnvReplacements('my-app', 'admin@my-app.example.com', 10);

    expect(r.DB_PORT).toBe('5442');
    expect(r.DB_TEST_PORT).toBe('5444');
    expect(r.DATABASE_URL).toContain('@0.0.0.0:5442/');
    // A PORT= env line would silently override the config offset
    expect(r.PORT).toBeUndefined();
  });
});

describe('generateEnvFromExample', () => {
  let dir: string;
  let examplePath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cella-env-'));
    examplePath = join(dir, '.env.example');
    writeFileSync(examplePath, '# comment line\nPROJECT_SLUG=cella\nDB_PORT=5432\nUNTOUCHED=keep\n', 'utf8');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('replaces matched keys and preserves comments and unmatched keys', async () => {
    const result = await generateEnvFromExample(examplePath, { PROJECT_SLUG: 'my-app', DB_PORT: '5442' });

    expect(result).toContain('# comment line');
    expect(result).toContain('PROJECT_SLUG=my-app');
    expect(result).toContain('DB_PORT=5442');
    expect(result).toContain('UNTOUCHED=keep');
  });

  it('returns null when the example file does not exist', async () => {
    const result = await generateEnvFromExample(join(dir, 'missing.env.example'), {});
    expect(result).toBeNull();
  });
});

describe('generateEnvConfigs', () => {
  const configs = generateEnvConfigs('my-app', 'My App', 0);

  it('generates a file for every environment', () => {
    for (const mode of ['development', 'staging', 'tunnel', 'test', 'production']) {
      expect(configs[`./shared/config/config.${mode}.ts`]).toBeDefined();
    }
  });

  it('exports each environment as a named const (config-builder imports them by name)', () => {
    for (const mode of ['development', 'staging', 'tunnel', 'test', 'production']) {
      const content = configs[`./shared/config/config.${mode}.ts`];
      expect(content).toContain(`export const ${mode} = {`);
      expect(content).not.toContain('export default');
      expect(content).toContain("import type { config as _default } from './config.default.ts'");
    }
  });

  it('imports DeepPartial from the config-builder module', () => {
    for (const content of Object.values(configs)) {
      expect(content).toContain("from '../src/config-builder/types.ts'");
      expect(content).not.toContain("from '../src/builder/types'");
    }
  });

  it('does not emit a removed debug flag', () => {
    for (const content of Object.values(configs)) {
      expect(content).not.toContain('debug:');
    }
  });

  it('bakes project-specific values, same-origin urls and devPorts into development', () => {
    const dev = configs['./shared/config/config.development.ts'];
    expect(dev).toContain("mode: 'development'");
    expect(dev).toContain("name: 'My App DEVELOPMENT'");
    expect(dev).toContain("slug: 'my-app-development'");
    // Same-origin shape: every service is a path under the frontend origin
    expect(dev).toContain("frontendUrl: 'http://localhost:3000'");
    expect(dev).toContain("backendUrl: 'http://localhost:3000/api'");
    expect(dev).toContain("backendAuthUrl: 'http://localhost:3000/api/auth'");
    expect(dev).toContain("yjsUrl: 'ws://localhost:3000/yjs'");
    expect(dev).toContain("mcpUrl: 'http://localhost:3000/mcp'");
    expect(dev).toContain('devPorts: { api: 4000, cdcHealth: 4001, yjs: 4002, mcp: 4003 }');
  });

  it('derives test urls from development as raw expressions', () => {
    const test = configs['./shared/config/config.test.ts'];
    expect(test).toContain("import { development } from './config.development.ts'");
    expect(test).toContain('frontendUrl: development.frontendUrl');
    expect(test).toContain('backendUrl: development.backendUrl');
    expect(test).toContain('yjsUrl: development.yjsUrl');
    expect(test).toContain('mcpUrl: development.mcpUrl');
  });

  it('keeps production minimal with no branding', () => {
    const prod = configs['./shared/config/config.production.ts'];
    expect(prod).toContain("mode: 'production'");
    expect(prod).toContain('satisfies DeepPartial<typeof _default>');
    expect(prod).not.toContain('name:');
  });

  it('applies the port offset to the frontend url and devPorts together', () => {
    const offset = generateEnvConfigs('my-app', 'My App', 10);
    const dev = offset['./shared/config/config.development.ts'];
    expect(dev).toContain("frontendUrl: 'http://localhost:3010'");
    expect(dev).toContain("backendUrl: 'http://localhost:3010/api'");
    expect(dev).toContain('devPorts: { api: 4010, cdcHealth: 4011, yjs: 4012, mcp: 4013 }');
  });
});
