import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import pc from 'picocolors';
import { addRemote } from '#/add-remote';
import { TEMPLATE_URL } from '#/constants';
import { type CreateOptions, showSuccess } from '#/modules/cli';
import { cleanTemplate } from '#/utils/clean-template';
import { downloadGithubTemplate } from '#/utils/download-template';
import { gitAddAll, gitCommit, gitInit } from '#/utils/git';
import { listTemplateFiles } from '#/utils/list-template-files';
import { createProgress, pauseSpinner, resumeSpinner } from '#/utils/progress';

/** Check if a path is a local directory */
function isLocalPath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('./') || path.startsWith('../');
}

export async function create({
  projectName,
  targetFolder,
  packageManager,
  templateUrl,
  templateRef,
  portOffset,
  adminEmail,
  silent = false,
}: CreateOptions): Promise<void> {
  // Save the original working directory
  const originalCwd = process.cwd();

  // Use custom template or default
  const template = templateUrl || TEMPLATE_URL;
  const isLocalTemplate = templateUrl && isLocalPath(templateUrl);

  const progress = createProgress('creating project', silent);

  try {
    // Create the target folder
    progress.step('creating project folder');
    await mkdir(targetFolder, { recursive: true });
    process.chdir(targetFolder);

    // Upstream commit the scaffold is based on (only known for remote templates). Stamped
    // as a trailer on the initial commit so the sync CLI can bootstrap the first merge-base.
    let baseSha: string | null = null;

    // Download or copy the template
    if (isLocalTemplate) {
      progress.step('copying local template');
      const sourcePath = resolve(originalCwd, templateUrl);

      // Check if target is inside source (would cause EINVAL). Use a path-boundary check
      // (not a string prefix) so siblings like `cella-try-app` next to `cella` aren't
      // misdetected as being inside the template.
      const rel = relative(sourcePath, targetFolder);
      const targetInsideTemplate = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
      if (targetInsideTemplate) {
        throw new Error(
          'Cannot create project inside the template directory.\n' +
            `  Run from outside: cd ~ && pnpm create @cellajs/cella ${projectName} --template ${templateUrl}`,
        );
      }

      // Copy only what git would track (respects .gitignore: no build output, no local .env secrets).
      const tracked = await listTemplateFiles(sourcePath);
      for (const rel of tracked) {
        const src = join(sourcePath, rel);
        if (!existsSync(src)) continue; // listed but deleted in the working tree
        const dest = join(targetFolder, rel);
        await mkdir(dirname(dest), { recursive: true });
        await cp(src, dest);
      }
    } else {
      // Pin to the chosen ref (release tag or commit SHA), else the default branch.
      const ref = templateRef ?? 'main';
      progress.step(`downloading cella template${templateRef ? ` (${templateRef})` : ''}`);
      baseSha = await downloadGithubTemplate(template, ref, targetFolder);
    }

    // Clean the template, generate configs
    progress.step('cleaning template');
    const displayName = projectName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    await cleanTemplate({ targetFolder, projectName, displayName, portOffset, adminEmail });

    // Initialize git repository. Git runs offline via isomorphic-git with an explicit
    // author, so it can't fail on missing user config — but if it fails for any other
    // reason (permissions, disk) the project files are already written and usable, so
    // warn and continue rather than aborting the whole scaffold.
    const gitFolderPath = join(targetFolder, '.git');
    if (!existsSync(gitFolderPath)) {
      try {
        progress.step('initializing git');
        await gitInit(targetFolder);
        await gitAddAll(targetFolder);
        // The `Cella-Base:` trailer records the upstream commit this scaffold snapshot was
        // taken from. The sync CLI reads it from the root commit to bootstrap the first
        // merge-base — the fork's fresh history otherwise shares no ancestor with upstream.
        const message = baseSha ? `Initial commit\n\nCella-Base: ${baseSha}` : 'Initial commit';
        await gitCommit(targetFolder, message);
      } catch (error) {
        if (!silent) {
          pauseSpinner();
          console.warn(`${pc.yellow('⚠')} skipped git init: ${error instanceof Error ? error.message : String(error)}`);
          resumeSpinner();
        }
      }
    }

    // Add upstream remote (best-effort: addRemote swallows its own failures via `silent`).
    progress.step('adding upstream remote');
    await addRemote({ targetFolder, silent: true });

    // Done
    progress.done(pc.bold(`created ${projectName}`));
  } catch (error) {
    progress.fail(error instanceof Error ? error.message : String(error));
    // Rethrow so callers (CLI entry, tests) see the real failure. The CLI entry
    // turns this into a non-zero exit; swallowing it here with process.exit hid
    // the underlying error from CI and vitest.
    throw error;
  }

  // Check if the working directory needs to be changed
  const needsCd = originalCwd !== targetFolder;
  const relativePath = relative(originalCwd, targetFolder);

  // Display final success message
  showSuccess(projectName, targetFolder, relativePath, needsCd, packageManager);
}
