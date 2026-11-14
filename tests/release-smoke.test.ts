import { execFileSync } from 'node:child_process';
import nodeFs, { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import git from 'isomorphic-git';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Packs this package, installs the tarball into a throwaway folder, so its dependencies resolve from its own
 * package.json, and runs the installed bin against the real `github:cellajs/cella` template over the network. This
 * proves the packed files, the bin and the dependency closure, which a `node index.js` run inside the repo cannot.
 * `test:release` and `prepublishOnly` run it; the default `pnpm test` leaves it out.
 */
describe('release smoke', () => {
  const packageRoot = resolve(import.meta.dirname, '..');
  const tempRoot = mkdtempSync(join(tmpdir(), 'create-cella-release-'));
  const installDir = join(tempRoot, 'installer');
  const targetFolder = join(tempRoot, 'smoke-app');

  afterAll(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('makes a repository whose first commit names its template commit and whose remote is cella-upstream', async () => {
    // `--ignore-scripts` keeps the `prepare` hook (lefthook) out of the `--json` output
    const packOutput = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', tempRoot], {
      cwd: packageRoot,
      encoding: 'utf8',
    });
    const [{ filename }] = JSON.parse(packOutput) as Array<{ filename: string }>;

    mkdirSync(installDir);
    writeFileSync(join(installDir, 'package.json'), JSON.stringify({ name: 'smoke-installer', private: true }));
    const options = { cwd: installDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 } as const;
    execFileSync('npm', ['install', join(tempRoot, filename), '--no-audit', '--no-fund'], options);

    const bin = join(installDir, 'node_modules', '.bin', 'create-cella');
    const args = ['--template', 'github:cellajs/cella', '--app-index', '1', '--admin-email', 'admin@smoke-app.com'];
    execFileSync(bin, [targetFolder, ...args], options);

    // `pnpm cella upgrade` reads both
    const [rootCommit] = await git.log({ fs: nodeFs, dir: targetFolder, depth: 1 });
    expect(rootCommit.commit.message).toMatch(/^Cella-Base: [0-9a-f]{40}$/m);
    const remotes = await git.listRemotes({ fs: nodeFs, dir: targetFolder });
    expect(remotes.map((r) => r.remote)).toContain('cella-upstream');
  }, 300000);
});
