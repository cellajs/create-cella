/**
 * Fetch lightweight metadata about the cella template so the scaffolder can offer
 * "latest release" vs "latest commit" as a starting point.
 *
 * The release tag is read from the template's git tags, over the transport the clone uses, so
 * it does not depend on the GitHub API and its limit for callers without a token. Dates and the
 * commit subject come from that API. Every helper fails soft; the caller falls back to the
 * default branch when no release is known.
 */
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { TEMPLATE_GIT_URL, TEMPLATE_REPOSITORY } from '#/constants';

const TEMPLATE_METADATA_API_BASE = `https://api.github.com/repos/${TEMPLATE_REPOSITORY}`;

/** Format an ISO timestamp as a locale-independent YYYY-MM-DD date. */
function toDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : 'unknown';
}

const GITHUB_HEADERS = { Accept: 'application/vnd.github+json' } as const;

export interface ReleaseInfo {
  /** Release tag, e.g. '0.18.1' */
  tag: string;
  /** Publication date, YYYY-MM-DD; absent when the GitHub API did not answer */
  date?: string;
}

export interface CommitInfo {
  /** Full commit SHA (used for a reproducible checkout) */
  sha: string;
  /** Short 7-char SHA for display */
  shortSha: string;
  /** First line of the commit message */
  message: string;
  /** Commit date, YYYY-MM-DD */
  date: string;
}

/**
 * Pick the latest template release from tag names: the highest plain version, with or without
 * the `v` prefix. Tags of another series (`create-cella-0.2.3`, `archive/pre-release`) and
 * pre-releases are no template release.
 */
export function pickLatestReleaseTag(tags: string[]): string | null {
  let latest: { tag: string; version: number[] } | null = null;
  for (const tag of tags) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
    if (!match) continue;
    const version = match.slice(1).map(Number);
    if (!latest || isNewer(version, latest.version)) latest = { tag, version };
  }
  return latest?.tag ?? null;
}

/** Whether version `a` is higher than `b`, both as [major, minor, patch]. */
function isNewer(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Fetch the latest template release: its tag from the git tags, its date from the GitHub API. */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  let tag: string | null;
  try {
    const refs = await git.listServerRefs({ http, url: TEMPLATE_GIT_URL, prefix: 'refs/tags/' });
    tag = pickLatestReleaseTag(refs.map(({ ref }) => ref.slice('refs/tags/'.length)));
  } catch {
    return null;
  }
  if (!tag) return null;

  return { tag, date: await fetchReleaseDate(tag) };
}

/** Publication date of a release, undefined when the GitHub API does not answer. */
async function fetchReleaseDate(tag: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${TEMPLATE_METADATA_API_BASE}/releases/tags/${tag}`, { headers: GITHUB_HEADERS });
    if (!response.ok) return undefined;

    const release = (await response.json()) as { published_at?: string };
    return release.published_at ? toDate(release.published_at) : undefined;
  } catch {
    return undefined;
  }
}

/** Fetch the latest commit on a branch (defaults to 'main'). */
export async function fetchLatestCommit(branch = 'main'): Promise<CommitInfo | null> {
  const apiUrl = `${TEMPLATE_METADATA_API_BASE}/commits/${branch}`;

  try {
    const response = await fetch(apiUrl, { headers: GITHUB_HEADERS });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      sha?: string;
      commit?: { message?: string; author?: { date?: string } };
    };
    if (!data.sha) return null;

    const message = (data.commit?.message ?? '').split('\n')[0];
    return { sha: data.sha, shortSha: data.sha.slice(0, 7), message, date: toDate(data.commit?.author?.date) };
  } catch {
    return null;
  }
}
