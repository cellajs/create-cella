import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Directory (relative to the project root) holding cella sync metadata. */
const CELLA_DIR = '.cella';

/** Committed file recording the upstream commit a scaffold was based on. */
const BASE_FILE = 'base';

/**
 * Record the upstream cella commit a scaffold was created from.
 *
 * A create-cella project starts from a template snapshot with a fresh, rootless initial
 * commit — it shares no git history with upstream cella. Without a recorded base, the first
 * `pnpm cella sync` has no merge-base and fails ("no common ancestor"). Writing the exact
 * source commit to `.cella/base` (committed) lets the sync CLI bootstrap a merge-base by
 * grafting the fork's root commit onto this base after fetching upstream.
 *
 * The file is human-readable (leading comments) but the sync CLI only reads the 40-char SHA,
 * so the comments are safe to keep.
 *
 * @param targetFolder - The project root.
 * @param sha - The upstream commit SHA the scaffold was based on.
 */
export async function writeScaffoldBase(targetFolder: string, sha: string): Promise<void> {
  const dir = join(targetFolder, CELLA_DIR);
  await mkdir(dir, { recursive: true });
  const contents =
    '# Upstream cella commit this project was scaffolded from (create-cella).\n' +
    '# Used by `pnpm cella sync` to bootstrap the first merge-base. Do not edit or delete.\n' +
    `${sha}\n`;
  await writeFile(join(dir, BASE_FILE), contents, 'utf8');
}
