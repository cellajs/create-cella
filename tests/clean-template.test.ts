import { describe, expect, it } from 'vitest';
import { stripForks } from '#/utils/clean-template';

const withForks = `export default defineConfig({
  settings: {
    upstreamUrl: 'git@github.com:cellajs/cella.git',
  },

  // Top-down interaction with forks.
  forks: [
    { name: 'raak', localPath: '../raak', remoteUrl: 'git@github.com:cellajs/raak.git', pullBranch: 'main' },
    { name: 'projectcampus', localPath: '../projectcampus', pullBranch: 'main' },
  ],

  // File overrides
  overrides: {
    ignored: ['README.md'],
  },
});
`;

const withoutForks = `export default defineConfig({
  settings: {
    upstreamUrl: 'git@github.com:cellajs/cella.git',
  },

  // File overrides
  overrides: {
    ignored: ['README.md'],
  },
});
`;

describe('stripForks', () => {
  it('removes the forks property, the comment above it and the blank line after it', () => {
    expect(stripForks(withForks)).toBe(withoutForks);
  });

  it('removes a list written on one line', () => {
    const oneLine = withForks.replace(
      / {2}forks: \[[\s\S]*? {2}\],\n/,
      "  forks: [{ name: 'raak', localPath: '../raak', pullBranch: 'main' }],\n",
    );
    expect(oneLine).toContain("forks: [{ name: 'raak'");
    expect(stripForks(oneLine)).toBe(withoutForks);
  });

  it('keeps arrays of the other properties', () => {
    expect(stripForks(withForks)).toContain("ignored: ['README.md']");
  });

  it('returns a config without forks unchanged', () => {
    expect(stripForks(withoutForks)).toBe(withoutForks);
  });
});
