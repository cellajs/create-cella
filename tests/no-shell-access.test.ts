import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Supply-chain guard: the published package runs no shell. It clones and commits through isomorphic-git, never the git
 * binary or a package manager, so Socket's `shellAccess` capability stays off it. The scan reads the source, so it
 * needs no build.
 */
describe('no shell access', () => {
  it('does not import child_process or a spawn helper', () => {
    const srcDir = resolve(import.meta.dirname, '..', 'src');
    // Real imports and requires, not prose in comments
    const forbidden = [
      /\bfrom\s+['"]node:child_process['"]/,
      /\brequire\(\s*['"](?:node:)?child_process['"]\s*\)/,
      /\bfrom\s+['"]nano-spawn['"]/,
    ];
    const offenders = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts'))
      .flatMap((file) => {
        const content = readFileSync(join(srcDir, file), 'utf8');
        return forbidden.filter((pattern) => pattern.test(content)).map((pattern) => `${file}: ${pattern}`);
      });

    expect(offenders).toEqual([]);
  });
});
