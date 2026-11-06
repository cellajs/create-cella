import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectUsedPorts, findNextAppIndex, isAppIndex } from '#/utils/detect-used-ports';

/** Write a fake sibling app with the given config.development.ts and, optionally, config.default.ts content. */
function writeFork(parent: string, name: string, configContent: string, defaultContent?: string): void {
  const configDir = join(parent, name, 'shared/config');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.development.ts'), configContent, 'utf8');
  if (defaultContent) writeFileSync(join(configDir, 'config.default.ts'), defaultContent, 'utf8');
}

const threeThousand =
  "export const development = {\n  frontendUrl: 'http://localhost:3000',\n  backendUrl: 'http://localhost:3000/api',\n};\n";
const templatePorts = 'devPorts: { frontend: 3000, api: 4000, cdcHealth: 4001 },';

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
      "export const development = {\n  frontendUrl: 'http://localhost:3020',\n  backendUrl: 'http://localhost:3020/api',\n  devPorts: { frontend: 3020, api: 4020, cdcHealth: 4021, yjs: 4022, mcp: 4023, oauth: 4024, internal: 4025, jobs: 4026 },\n};\n",
    );
    // devPorts with api after another key and off the paired offset: the block is read, not the fallback
    writeFork(
      parent,
      'fork-devports-custom',
      "export const development = {\n  frontendUrl: 'http://localhost:3050',\n  devPorts: { frontend: 3050, api: 4150 },\n};\n",
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
    // devAppIndex moves the template's ports (current generator output)
    writeFork(
      parent,
      'fork-index',
      threeThousand,
      `export const config = {\n  devAppIndex: 6,\n  ${templatePorts}\n};\n`,
    );
    // The origin and the service ports, as the template has them, moved by devAppIndex
    writeFork(
      parent,
      'fork-services',
      "export const development = {\n  origin: 'http://localhost:3000',\n};\n",
      'export const config = {\n  devAppIndex: 2,\n  services: {\n    frontend: { enabled: true, port: 3000 },\n    backend: { enabled: true, port: 4000, internalPort: 4005 },\n  },\n};\n',
    );
    // Literal ports in both files, as raak has them: frontend on +1, services on +10
    writeFork(
      parent,
      'fork-literal-default',
      "export const development = {\n  frontendUrl: 'http://localhost:3001',\n  backendUrl: 'http://localhost:3001/api',\n};\n",
      'export const config = {\n  devPorts: { frontend: 3001, api: 4010, cdcHealth: 4011 },\n};\n',
    );
    // Not a fork: no config file
    mkdirSync(join(parent, 'unrelated-dir'), { recursive: true });
  });

  afterAll(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  it('detects every config shape and its ports', async () => {
    const used = await detectUsedPorts(target);
    const byProject = Object.fromEntries(used.map((u) => [u.project, u]));

    expect(byProject['fork-devports']).toMatchObject({ frontend: 3020, backend: 4020 });
    expect(byProject['fork-devports-custom']).toMatchObject({ frontend: 3050, backend: 4150 });
    expect(byProject['fork-legacy']).toMatchObject({ frontend: 3010, backend: 4010 });
    // No devPorts and no port in backendUrl: assume the paired service port
    expect(byProject['fork-sameorigin-bare']).toMatchObject({ frontend: 3030, backend: 4030 });
    expect(byProject['fork-index']).toMatchObject({ frontend: 3006, backend: 4060 });
    expect(byProject['fork-services']).toMatchObject({ frontend: 3002, backend: 4020 });
    expect(byProject['fork-literal-default']).toMatchObject({ frontend: 3001, backend: 4010 });
    expect(byProject['unrelated-dir']).toBeUndefined();
  });

  it('suggests the first index free on both the frontend and the service block, never 4', async () => {
    const at = (project: string, frontend: number, backend: number) => ({ project, frontend, backend });
    expect(findNextAppIndex([])).toBe(0);
    // A frontend of 3001 takes index 1, services on 4020 take index 2, whatever the other port is
    expect(findNextAppIndex([at('a', 3000, 4000), at('b', 3001, 4310), at('c', 3320, 4020)])).toBe(3);
    expect(findNextAppIndex([at('a', 3000, 4000), at('b', 3001, 4010), at('c', 3002, 4020), at('d', 3003, 4030)])).toBe(
      5,
    );
  });
});

describe('isAppIndex', () => {
  it('takes 0-9 without 4', () => {
    expect([0, 3, 5, 9].every(isAppIndex)).toBe(true);
    expect([4, -1, 10, 1.5, Number.NaN].some(isAppIndex)).toBe(false);
  });
});
