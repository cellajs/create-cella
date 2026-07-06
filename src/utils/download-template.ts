import fs from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

/** Parse `github:owner/repo` or `owner/repo` into its owner and repo parts. */
function parseGithubRepo(template: string): { owner: string; repo: string } {
  const [owner, repo] = template.replace(/^github:/, '').split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid template '${template}'. Expected 'github:owner/repo'.`);
  }
  return { owner, repo };
}

/**
 * Clones a GitHub template into `targetFolder` using isomorphic-git (pure JS).
 *
 * A shallow, single-branch clone over HTTPS — no `git` binary, no `child_process`,
 * so `create-cella` keeps a clean supply-chain profile (no shell access). Unlike a
 * raw tarball parse, isomorphic-git reconstructs the tree itself, so file modes and
 * long paths are always correct. The cloned `.git` history is discarded afterwards;
 * scaffolding re-initialises the repo with a fresh initial commit.
 *
 * @param template - `github:owner/repo` (or `owner/repo`).
 * @param ref - Branch or tag to check out (e.g. `main` or a release tag).
 * @param targetFolder - Directory to clone the template into.
 * @returns The exact upstream commit SHA the template was scaffolded from.
 */
export async function downloadGithubTemplate(template: string, ref: string, targetFolder: string): Promise<string> {
  const { owner, repo } = parseGithubRepo(template);
  const url = `https://github.com/${owner}/${repo}.git`;

  await git.clone({ fs, http, dir: targetFolder, url, ref, singleBranch: true, depth: 1 });

  // Capture the exact commit the scaffold is based on before discarding history. It is
  // stamped as a `Cella-Base:` trailer on the initial commit, where the sync CLI reads it
  // to bootstrap the first merge-base (the fork shares no git history with upstream).
  const baseSha = await git.resolveRef({ fs, dir: targetFolder, ref: 'HEAD' });

  // Drop the cloned history — the scaffold gets its own fresh initial commit.
  await rm(join(targetFolder, '.git'), { recursive: true, force: true });

  return baseSha;
}
