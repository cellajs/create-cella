import { execFile } from 'node:child_process';
import fs, { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import git from 'isomorphic-git';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A run that fails after writing files prints the failure once and leaves nothing behind for the next run to refuse
describe('a failed create', () => {
  const root = mkdtempSync(join(tmpdir(), 'create-cella-cleanup-'));
  const template = join(root, 'template');
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  beforeAll(async () => {
    // A folder where the app's changelog goes fails the run after the template's files are copied
    mkdirSync(join(template, 'CHANGELOG.md'), { recursive: true });
    writeFileSync(join(template, 'CHANGELOG.md', 'keep'), '');
    await git.init({ fs, dir: template });
    await git.add({ fs, dir: template, filepath: '.' });
    await git.commit({ fs, dir: template, message: 'template', author: { name: 'test', email: 'test@example.com' } });
  });

  const run = async (targetFolder: string) => {
    const cli = resolve(import.meta.dirname, '..', 'src', 'create-cella-cli.ts');
    const args = [targetFolder, '--template', template, '--app-index', '1', '--admin-email', 'admin@example.com'];
    const error = await promisify(execFile)(process.execPath, ['--import', 'tsx', cli, ...args]).catch((e) => e);
    expect(error.code).toBe(1);
    expect(`${error.stdout}${error.stderr}`.match(/EISDIR/g)).toHaveLength(1);
  };

  it('removes the folders it made', async () => {
    await run(join(root, 'new', 'my-app'));
    expect(existsSync(join(root, 'new'))).toBe(false);
  });

  it('empties a folder that existed empty', async () => {
    const targetFolder = join(root, 'my-app');
    mkdirSync(targetFolder);
    await run(targetFolder);
    expect(readdirSync(targetFolder)).toEqual([]);
  });
});
