import fs from 'node:fs';
import git from 'isomorphic-git';
import { warn } from './display';
import { githubGitUrl, templateRepository } from './template';

/**
 * Make the app's repository: one commit of its files, and the template as remote `cella-upstream`, the name
 * `pnpm cella upgrade` looks for. The commit's `Cella-Base:` trailer names the template commit the files come from,
 * which the upgrade reads from the root commit to find its first merge base: the app shares no history with the template.
 * A failure only warns: the app's files stay usable without git.
 */
export async function makeRepository(dir: string, baseCommit: string | null): Promise<void> {
  try {
    await git.init({ fs, dir, defaultBranch: 'main' });
    await git.add({ fs, dir, filepath: '.' });
    const message = baseCommit ? `Initial commit\n\nCella-Base: ${baseCommit}` : 'Initial commit';
    // An explicit author, so the commit needs no git config on this machine
    await git.commit({ fs, dir, message, author: { name: 'cella', email: 'info@cellajs.com' } });
    await git.addRemote({ fs, dir, remote: 'cella-upstream', url: githubGitUrl(templateRepository), force: true });
  } catch (error) {
    warn(`skipped git init: ${error instanceof Error ? error.message : String(error)}`);
  }
}
