import { execFile } from 'node:child_process';
import fs, { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import git from 'isomorphic-git';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchLatestRelease } from '../src/template';

/**
 * Creates an app with the CLI from the default branch of the real `github:cellajs/cella` template, cloned over the
 * network from github.com, and reads the files and the repository it made. Installing dependencies is no part of it.
 */
describe('create-cella e2e', () => {
  const appName = `cella-e2e-test-${Date.now()}`;
  const targetFolder = join(tmpdir(), appName);
  let output = '';

  beforeAll(async () => {
    const cli = resolve(import.meta.dirname, '..', 'src', 'create-cella-cli.ts');
    const args = [
      '--template',
      'github:cellajs/cella',
      '--app-index',
      '0',
      '--admin-email',
      `admin@${appName}.example.com`,
    ];
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
      '--import',
      'tsx',
      cli,
      targetFolder,
      ...args,
    ]);
    output = `${stdout}${stderr}`;
  }, 180000);

  afterAll(() => {
    if (existsSync(targetFolder)) rmSync(targetFolder, { recursive: true, force: true });
  }, 60000);

  it('should find every template path it expects', () => {
    expect(output).not.toContain('Not in the template');
  });

  describe('README.md (from QUICKSTART)', () => {
    it('should have README.md with quickstart content', () => {
      const content = readFileSync(join(targetFolder, 'README.md'), 'utf-8');
      // The quickstart's markers, without the create step that just ran
      expect(content).toContain('## Run');
      expect(content).not.toContain('## Create');
      expect(content).toContain('pnpm docker');
      expect(content).toContain('pnpm dev');
    });
  });

  describe('.env files', () => {
    it('should have one .env with the admin email and no port: ports follow the shared config', () => {
      const content = readFileSync(join(targetFolder, '.env'), 'utf-8');
      expect(content).toContain(`ADMIN_EMAIL=admin@${appName}.example.com`);
      expect(content).not.toMatch(/^(PROJECT_SLUG|DB_PORT|DB_TEST_PORT|PORT)=/m);
    });

    it('should have frontend .env file', () => {
      expect(existsSync(join(targetFolder, 'frontend', '.env'))).toBe(true);
    });
  });

  describe('release/version reset', () => {
    it('should set root package.json name to the app slug and version to 0.0.0', () => {
      const pkg = JSON.parse(readFileSync(join(targetFolder, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe(appName);
      expect(pkg.version).toBe('0.0.0');
    });

    it('should reset the release-please manifest to 0.0.0', () => {
      const manifest = JSON.parse(readFileSync(join(targetFolder, '.github/release-please-manifest.json'), 'utf-8'));
      expect(manifest['.']).toBe('0.0.0');
    });

    it('should reset CHANGELOG.md to a fresh stub', () => {
      const changelog = readFileSync(join(targetFolder, 'CHANGELOG.md'), 'utf-8');
      expect(changelog.trim()).toBe('# Changelog');
    });

    it('should point release-please changelog-path at the root CHANGELOG.md', () => {
      const config = JSON.parse(readFileSync(join(targetFolder, '.github/release-please-config.json'), 'utf-8'));
      expect(config.packages['.']['changelog-path']).toBe('CHANGELOG.md');
    });
  });

  // `pnpm cella upgrade` finds the template under this remote, and its first merge base in the root commit's trailer
  describe('git repository', () => {
    it('should have upstream remote configured', async () => {
      const remotes = await git.listRemotes({ fs, dir: targetFolder });
      expect(remotes).toContainEqual({ remote: 'cella-upstream', url: 'https://github.com/cellajs/cella.git' });
    });

    it('should stamp the template commit as a Cella-Base trailer on the initial commit', async () => {
      const [head] = await git.log({ fs, dir: targetFolder, depth: 1 });
      expect(head.commit.message).toMatch(/^Cella-Base: [0-9a-f]{40}$/m);
    });
  });

  describe('upgrade config', () => {
    it('should not carry the apps the template itself upgrades', () => {
      const content = readFileSync(join(targetFolder, 'cella', 'cella.config.ts'), 'utf-8');
      expect(content).toContain('upstreamUrl');
      expect(content).not.toContain('forks:');
      expect(content).not.toContain('raak');
    });
  });

  describe('latest release', () => {
    it('should read a version tag from the template without the GitHub API', async () => {
      const release = await fetchLatestRelease();
      expect(release?.tag).toMatch(/^v?\d+\.\d+\.\d+$/);
    });
  });

  describe('placeholder config', () => {
    it('should have interpolated config.default.ts without __tokens__', () => {
      const content = readFileSync(join(targetFolder, 'shared', 'config', 'config.default.ts'), 'utf-8');
      expect(content).not.toContain('__project_name__');
      expect(content).not.toContain('__project_slug__');
    });

    it('should remove the consumed config.template.ts from the app', () => {
      expect(existsSync(join(targetFolder, 'shared', 'config', 'config.template.ts'))).toBe(false);
    });
  });
});
