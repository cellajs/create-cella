import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
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

/** Remove what a run wrote: the folders `mkdir` made, else everything in the target, which the CLI only accepts empty. */
async function removeOutput(targetFolder: string, createdFolder: string | undefined): Promise<void> {
  if (createdFolder) return rm(createdFolder, { recursive: true, force: true });
  const entries = await readdir(targetFolder);
  await Promise.all(entries.map((entry) => rm(join(targetFolder, entry), { recursive: true, force: true })));
}

/**
 * Create an app from the template in `targetFolder`, which must not exist or be empty.
 * @returns The template paths this scaffolder expected and did not find.
 * @throws When a step fails, after removing what the run wrote; a signal does the same and exits.
 */
export async function create({
  projectName,
  targetFolder,
  packageManager,
  templateUrl,
  templateRef,
  appIndex,
  adminEmail,
  silent = false,
}: CreateOptions): Promise<string[]> {
  // Save the original working directory
  const originalCwd = process.cwd();

  // Use custom template or default
  const template = templateUrl || TEMPLATE_URL;
  const isLocalTemplate = templateUrl && isLocalPath(templateUrl);

  const progress = createProgress('creating project', silent);
  let undo = async () => {};
  const onSignal = (code: number) => () => {
    pauseSpinner();
    void undo().finally(() => process.exit(code));
  };
  const onSigint = onSignal(130);
  const onSigterm = onSignal(143);
  process.once('SIGINT', onSigint).once('SIGTERM', onSigterm);
  let missing: string[];

  try {
    // Create the target folder
    progress.step('creating project folder');
    const createdFolder = await mkdir(targetFolder, { recursive: true });
    undo = () => {
      process.chdir(originalCwd);
      return removeOutput(targetFolder, createdFolder);
    };
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
    missing = await cleanTemplate({ targetFolder, projectName, displayName, appIndex, adminEmail });

    // Git runs offline through isomorphic-git with an explicit author: it needs no user config. A failure for
    // another reason (permissions, disk) leaves the app's files written and usable, and the run warns and goes on.
    try {
      progress.step('initializing git');
      await gitInit(targetFolder);
      await gitAddAll(targetFolder);
      // The `Cella-Base:` trailer records the upstream commit of this snapshot. The sync CLI reads it from the root
      // commit to bootstrap the first merge-base: the app's fresh history shares no ancestor with upstream.
      const message = baseSha ? `Initial commit\n\nCella-Base: ${baseSha}` : 'Initial commit';
      await gitCommit(targetFolder, message);
    } catch (error) {
      if (!silent) {
        pauseSpinner();
        console.warn(`${pc.yellow('⚠')} skipped git init: ${error instanceof Error ? error.message : String(error)}`);
        resumeSpinner();
      }
    }

    // Add upstream remote (best-effort: addRemote swallows its own failures via `silent`).
    progress.step('adding upstream remote');
    await addRemote({ targetFolder, silent: true });

    // Done
    progress.done(pc.bold(`created ${projectName}`));
  } catch (error) {
    progress.fail(error instanceof Error ? error.message : String(error));
    await undo();
    throw error;
  } finally {
    process.off('SIGINT', onSigint).off('SIGTERM', onSigterm);
  }

  if (missing.length > 0 && !silent) {
    console.warn(`${pc.yellow('⚠')} Not in the template, skipped: ${missing.join(', ')}`);
  }

  // Check if the working directory needs to be changed
  const needsCd = originalCwd !== targetFolder;
  const relativePath = relative(originalCwd, targetFolder);

  // Display final success message
  showSuccess(
    projectName,
    targetFolder,
    relativePath,
    needsCd,
    packageManager,
    appIndex,
    adminEmail ?? `admin@${projectName}.example.com`,
  );
  return missing;
}
