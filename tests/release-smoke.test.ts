import { execFileSync } from 'node:child_process';
import nodeFs, { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import git from 'isomorphic-git';
import { afterAll, describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };

/**
 * Release smoke test against the real published artifact.
 *
 * Packs the package into a tarball, installs that tarball into a throwaway dir (so the CLI's
 * own dependencies resolve from its package.json, not the workspace), then runs the installed
 * `create-cella` bin to scaffold a project from the real `github:cellajs/cella` template. This
 * proves the packed file set, the bin wiring and the dependency closure all work — things a
 * `node index.js` run from inside the repo can't catch. Gated at publish time via
 * `test:release`/`prepublishOnly` and excluded from the default `pnpm test` run.
 *
 * Requires network access to codeload.github.com.
 */
describe('release smoke', () => {
  const packageRoot = resolve(import.meta.dirname, '..');
  const tempRoot = mkdtempSync(join(tmpdir(), 'create-cella-release-'));
  const installDir = join(tempRoot, 'installer');
  const targetFolder = join(tempRoot, 'smoke-app');

  afterAll(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('packs, installs, and scaffolds via the installed bin with values propagated into env and config', async () => {
    // 1. Pack the built package into a tarball. `--ignore-scripts` keeps the `prepare` hook
    //    (lefthook) from writing to stdout and corrupting the `--json` output.
    const packOutput = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', tempRoot], {
      cwd: packageRoot,
      encoding: 'utf8',
    });
    const [packResult] = JSON.parse(packOutput) as Array<{ filename: string; name: string; version: string }>;
    expect(packResult.name).toBe(packageJson.name);
    expect(packResult.version).toBe(packageJson.version);
    const tarballPath = join(tempRoot, packResult.filename);
    expect(existsSync(tarballPath)).toBe(true);

    // 2. Install the tarball into an isolated dir so deps resolve from the package itself.
    mkdirSync(installDir);
    writeFileSync(join(installDir, 'package.json'), JSON.stringify({ name: 'smoke-installer', private: true }));
    execFileSync('npm', ['install', tarballPath, '--no-audit', '--no-fund'], {
      cwd: installDir,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    // 3. Run the installed bin to scaffold from the real github template. Git steps run for
    //    real — isomorphic-git works offline with an explicit author, so no git config needed.
    const bin = join(installDir, 'node_modules', '.bin', 'create-cella');
    execFileSync(
      bin,
      [
        targetFolder,
        '--template',
        'github:cellajs/cella',
        '--port-offset',
        '10',
        '--admin-email',
        'admin@smoke-app.com',
      ],
      {
        cwd: installDir,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const backendEnvPath = join(targetFolder, 'backend', '.env');
    const developmentConfigPath = join(targetFolder, 'shared', 'config', 'config.development.ts');

    expect(existsSync(backendEnvPath)).toBe(true);
    expect(existsSync(developmentConfigPath)).toBe(true);

    const backendEnv = readFileSync(backendEnvPath, 'utf8');
    const developmentConfig = readFileSync(developmentConfigPath, 'utf8');

    expect(backendEnv).toContain('PROJECT_SLUG=smoke-app');
    expect(backendEnv).toContain('DB_PORT=5442');
    expect(backendEnv).toContain('DB_TEST_PORT=5444');
    expect(backendEnv).toContain('DATABASE_URL=postgres://runtime_role:dev_password@0.0.0.0:5442/postgres');
    expect(backendEnv).toContain('ADMIN_EMAIL=admin@smoke-app.com');
    expect(backendEnv).toContain('PORT=4010');

    expect(developmentConfig).toContain("slug: 'smoke-app-development'");
    expect(developmentConfig).toContain("frontendUrl: 'http://localhost:3010'");
    expect(developmentConfig).toContain("backendUrl: 'http://localhost:4010'");
    expect(developmentConfig).toContain("backendAuthUrl: 'http://localhost:4010/auth'");

    // Git steps run for real now — assert the repo was initialized, the root commit carries
    // the `Cella-Base:` provenance trailer the sync CLI bootstraps its first merge-base from,
    // and the upstream remote was added under the name the sync CLI expects.
    expect(existsSync(join(targetFolder, '.git'))).toBe(true);

    const [rootCommit] = await git.log({ fs: nodeFs, dir: targetFolder, depth: 1 });
    expect(rootCommit.commit.message).toMatch(/^Cella-Base: [0-9a-f]{40}$/m);

    const remotes = await git.listRemotes({ fs: nodeFs, dir: targetFolder });
    expect(remotes.map((r) => r.remote)).toContain('cella-upstream');
  }, 300000);
});
