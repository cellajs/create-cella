import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateEnvFromExample, getBackendEnvReplacements, setDevAppIndex } from '#/constants';

/**
 * Fast unit tests for the env generation helpers.
 * These do not require a full project install (unlike e2e.test.ts).
 */
describe('getBackendEnvReplacements', () => {
  it('sets the admin email and no port: the ports follow devAppIndex in the shared config', () => {
    const r = getBackendEnvReplacements('admin@my-app.example.com');

    expect(r).toEqual({ ADMIN_EMAIL: 'admin@my-app.example.com' });
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

describe('setDevAppIndex', () => {
  it('sets the number in the template config', () => {
    expect(setDevAppIndex('  devAppIndex: 0,\n  devPorts: {},\n', 2)).toBe('  devAppIndex: 2,\n  devPorts: {},\n');
  });

  it('refuses a number the template has no key for, and accepts index 0 there', () => {
    expect(() => setDevAppIndex('  devPorts: {},\n', 2)).toThrow('no devAppIndex');
    expect(setDevAppIndex('  devPorts: {},\n', 0)).toBe('  devPorts: {},\n');
  });
});
