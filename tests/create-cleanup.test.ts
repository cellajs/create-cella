import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { create } from '#/create';

// A run that fails after writing files leaves nothing behind for the next run to refuse
describe('a failed create', () => {
  const root = mkdtempSync(join(tmpdir(), 'create-cella-cleanup-'));
  const template = join(root, 'template');
  // Without devAppIndex in its config the template fails at app index 1, after its files are copied
  mkdirSync(join(template, 'shared', 'config'), { recursive: true });
  writeFileSync(join(template, 'shared', 'config', 'config.template.ts'), "export const config = { slug: 'x' };\n");
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const run = (targetFolder: string) =>
    create({
      projectName: 'my-app',
      targetFolder,
      packageManager: 'pnpm',
      templateUrl: template,
      appIndex: 1,
      silent: true,
    });

  it('removes the folders it made', async () => {
    await expect(run(join(root, 'new', 'my-app'))).rejects.toThrow(/devAppIndex/);
    expect(existsSync(join(root, 'new'))).toBe(false);
  });

  it('empties a folder that existed empty', async () => {
    const targetFolder = join(root, 'my-app');
    mkdirSync(targetFolder);
    await expect(run(targetFolder)).rejects.toThrow(/devAppIndex/);
    expect(readdirSync(targetFolder)).toEqual([]);
  });
});
