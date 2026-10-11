import { describe, expect, it } from 'vitest';
import { pickLatestReleaseTag } from '#/utils/fetch-template-metadata';

describe('pickLatestReleaseTag', () => {
  it('compares versions by number, not as text', () => {
    expect(pickLatestReleaseTag(['0.9.0', '0.18.1', '0.18.0', '0.2.10'])).toBe('0.18.1');
  });

  it('skips tags of another series and pre-releases', () => {
    expect(pickLatestReleaseTag(['create-cella-0.2.3', 'archive/pre-release', '0.18.1', '1.0.0-rc.1'])).toBe('0.18.1');
  });

  it('accepts the v prefix next to bare versions', () => {
    expect(pickLatestReleaseTag(['0.4.0', 'v0.5.0'])).toBe('v0.5.0');
  });

  it('returns null when no tag is a release', () => {
    expect(pickLatestReleaseTag(['create-cella-0.2.3'])).toBeNull();
    expect(pickLatestReleaseTag([])).toBeNull();
  });
});
