import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectUsedPorts, findNextOffset } from '#/utils/detect-used-ports';

/** Write a fake sibling fork with the given config.development.ts content. */
function writeFork(parent: string, name: string, configContent: string): void {
  const configDir = join(parent, name, 'shared/config');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.development.ts'), configContent, 'utf8');
}

describe('detectUsedPorts', () => {
  let parent: string;
  let target: string;

  beforeAll(() => {
    parent = mkdtempSync(join(tmpdir(), 'cella-forks-'));
    target = join(parent, 'new-fork');

    // Same-origin shape with devPorts (current generator output)
    writeFork(
      parent,
      'fork-devports',
      "export const development = {\n  frontendUrl: 'http://localhost:3020',\n  backendUrl: 'http://localhost:3020/api',\n  devPorts: { api: 4020, cdcHealth: 4021, yjs: 4022, mcp: 4023 },\n};\n",
    );
    // Legacy shape: backendUrl on its own port
    writeFork(
      parent,
      'fork-legacy',
      "export const development = {\n  frontendUrl: 'http://localhost:3010',\n  backendUrl: 'http://localhost:4010',\n};\n",
    );
    // Same-origin shape without devPorts (post-same-origin, pre-devPorts fork)
    writeFork(
      parent,
      'fork-sameorigin-bare',
      "export const development = {\n  frontendUrl: 'http://localhost:3030',\n  backendUrl: 'http://localhost:3030/api',\n};\n",
    );
    // Not a fork: no config file
    mkdirSync(join(parent, 'unrelated-dir'), { recursive: true });
  });

  afterAll(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  it('detects all three config shapes and their backend ports', async () => {
    const used = await detectUsedPorts(target);
    const byProject = Object.fromEntries(used.map((u) => [u.project, u]));

    expect(byProject['fork-devports']).toMatchObject({ frontend: 3020, backend: 4020, offset: 20 });
    expect(byProject['fork-legacy']).toMatchObject({ frontend: 3010, backend: 4010, offset: 10 });
    // No devPorts and no port in backendUrl: assume the paired service offset
    expect(byProject['fork-sameorigin-bare']).toMatchObject({ frontend: 3030, backend: 4030, offset: 30 });
    expect(byProject['unrelated-dir']).toBeUndefined();
  });

  it('suggests the next free offset decade', async () => {
    const used = await detectUsedPorts(target);
    // 0 free (no fork on 3000), offsets 10/20/30 taken
    expect(findNextOffset(used)).toBe(0);
    expect(findNextOffset([...used, { project: 'x', frontend: 3000, backend: 4000, offset: 0 }])).toBe(40);
  });
});
