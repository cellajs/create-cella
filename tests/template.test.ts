import { describe, expect, it } from 'vitest';
import { pickLatestReleaseTag } from '../src/template';

// `pnpm cella upgrade` picks the latest release by the same rule and order
describe('pickLatestReleaseTag', () => {
  it('compares versions by number, not as text', () => {
    expect(pickLatestReleaseTag(['0.9.0', '0.18.1', '0.18.0', '0.2.10'])).toBe('0.18.1');
  });

  it('skips tags of another series', () => {
    expect(pickLatestReleaseTag(['create-cella-0.2.3', 'archive/pre-release', '0.18.1'])).toBe('0.18.1');
  });

  it("sorts as git's version order does: a pre-release after its release, the v prefix after bare versions", () => {
    expect(pickLatestReleaseTag(['1.0.0-rc.1', '1.0.0'])).toBe('1.0.0-rc.1');
    expect(pickLatestReleaseTag(['v0.5.0', '0.6.0'])).toBe('v0.5.0');
  });

  it('returns null when no tag is a release', () => {
    expect(pickLatestReleaseTag(['create-cella-0.2.3'])).toBeNull();
    expect(pickLatestReleaseTag([])).toBeNull();
  });
});
