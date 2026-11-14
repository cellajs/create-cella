import fs, { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import type { Answers } from './answers';
import { step } from './display';

export const templateRepository = 'cellajs/cella';

/** The HTTPS git URL of `github:owner/repo` or `owner/repo`: reading a public repository needs no SSH key. */
export function githubGitUrl(template: string): string {
  const [owner, repo] = template.replace(/^github:/, '').split('/');
  if (!owner || !repo) throw new Error(`Invalid template '${template}'. Expected 'github:owner/repo'.`);
  return `https://github.com/${owner}/${repo}.git`;
}

/** A version, with or without the `v` prefix; `create-cella-0.2.3` and `archive/pre-release` start with a name. */
const releaseTagPattern = /^v?\d[\w.+-]*$/;

/** The highest release tag, in git's `version:refname` order as `pnpm cella upgrade` sorts them, or null. */
export function pickLatestReleaseTag(tags: string[]): string | null {
  const releases = tags.filter((tag) => releaseTagPattern.test(tag));
  return releases.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1) ?? null;
}

/**
 * The latest template release: its tag from the git tags, over the transport the clone uses, so the GitHub API limit
 * for callers without a token cannot hide it; its date (YYYY-MM-DD) from that API when it answers. Null offline.
 */
export async function fetchLatestRelease(): Promise<{ tag: string; date?: string } | null> {
  const refs = await git
    .listServerRefs({ http, url: githubGitUrl(templateRepository), prefix: 'refs/tags/' })
    .catch(() => []);
  const tag = pickLatestReleaseTag(refs.map(({ ref }) => ref.slice('refs/tags/'.length)));
  if (!tag) return null;

  const release = await fetchGithub<{ published_at?: string }>(`releases/tags/${tag}`);
  return { tag, date: release?.published_at?.slice(0, 10) };
}

/** The latest commit on the template's main branch, with its subject and date (YYYY-MM-DD), or null. */
export async function fetchLatestCommit(): Promise<{ sha: string; message: string; date: string } | null> {
  const data = await fetchGithub<{ sha?: string; commit?: { message?: string; author?: { date?: string } } }>(
    'commits/main',
  );
  if (!data?.sha) return null;
  const message = (data.commit?.message ?? '').split('\n')[0];
  return { sha: data.sha, message, date: data.commit?.author?.date?.slice(0, 10) ?? 'unknown' };
}

/** A GitHub API answer about the template, or null: callers without a token have a low limit. */
async function fetchGithub<T>(path: string): Promise<T | null> {
  try {
    const url = `https://api.github.com/repos/${templateRepository}/${path}`;
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

const isLocalPath = (path: string): boolean => path.startsWith('/') || path.startsWith('./') || path.startsWith('../');

/**
 * Put the template's files in `targetFolder`: a shallow clone of a GitHub template, or the tracked files of a local
 * checkout from its working tree, so build output and local `.env` secrets stay behind.
 * @returns The template commit the files come from; null when isomorphic-git cannot resolve a local checkout's `HEAD`,
 * as in a linked worktree.
 */
export async function getTemplate({ template, templateRef, targetFolder, name }: Answers): Promise<string | null> {
  if (!template || !isLocalPath(template)) {
    step(`downloading cella template${templateRef ? ` (${templateRef})` : ''}`);
    const url = githubGitUrl(template ?? templateRepository);
    // Isomorphic-git needs no git binary and no shell; the clone's history goes, since the app starts its own
    await git.clone({ fs, http, dir: targetFolder, url, ref: templateRef ?? 'main', singleBranch: true, depth: 1 });
    const baseCommit = await git.resolveRef({ fs, dir: targetFolder, ref: 'HEAD' });
    await rm(join(targetFolder, '.git'), { recursive: true, force: true });
    return baseCommit;
  }

  step('copying local template');
  const source = resolve(template);
  const rel = relative(source, targetFolder);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error(
      'Cannot create the app inside the template directory.\n' +
        `  Run from outside: cd ~ && pnpm create @cellajs/cella ${name} --template ${template}`,
    );
  }

  const files = await git.listFiles({ fs, dir: source });
  if (files.length === 0) throw new Error(`${source} is no git checkout: a local template must be one.`);
  for (const file of files) {
    const from = join(source, file);
    // Tracked, but deleted in the working tree
    if (!existsSync(from)) continue;
    const to = join(targetFolder, file);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
  return git.resolveRef({ fs, dir: source, ref: 'HEAD' }).catch(() => null);
}
