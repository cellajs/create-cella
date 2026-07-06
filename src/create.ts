import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { checkbox } from '@inquirer/prompts';
import pc from 'picocolors';
import { addRemote } from '#/add-remote';
import { CELLA_REMOTE_NAME, CELLA_REMOTE_URL, TEMPLATE_URL } from '#/constants';
import { type CreateOptions, confirmChoice, showSuccess } from '#/modules/cli';
import { cleanTemplate } from '#/utils/clean-template';
import { downloadGithubTemplate } from '#/utils/download-template';
import { gitAddAll, gitCommit, gitInit } from '#/utils/git';
import { listTemplateFiles } from '#/utils/list-template-files';
import { createProgress, pauseSpinner, resumeSpinner } from '#/utils/progress';
import { optionalModuleFolders, scanOptionalModules } from '#/utils/scan-optional-modules';

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

    // Ask which optional modules to keep, then drop deselected paths
    if (!silent) await promptOptionalModules(targetFolder);

    // Clean the template, generate configs
    progress.step('cleaning template');
    const displayName = projectName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    await cleanTemplate({ targetFolder, projectName, displayName, portOffset, adminEmail });

    // Initialize git repository and add the upstream remote. Non-fatal: the scaffold
    // is already complete, so on failure we warn and hand the user the manual steps
    // instead of tearing down an otherwise working project.
    const gitFolderPath = join(targetFolder, '.git');
    try {
      if (!existsSync(gitFolderPath)) {
        progress.step('initializing git');
        await gitInit(targetFolder);
        await gitAddAll(targetFolder);
        // The `Cella-Base:` trailer records the upstream commit this scaffold snapshot was
        // taken from. The sync CLI reads it from the root commit to bootstrap the first
        // merge-base — the fork's fresh history otherwise shares no ancestor with upstream.
        const message = baseSha ? `Initial commit\n\nCella-Base: ${baseSha}` : 'Initial commit';
        await gitCommit(targetFolder, message);
      }
      progress.step('adding upstream remote');
      await addRemote({ targetFolder });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      progress.warn(
        `${reason} — run 'git init' and 'git remote add ${CELLA_REMOTE_NAME} ${CELLA_REMOTE_URL}' manually`,
      );
    }

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

/**
 * Scan the downloaded template for optional modules and let the user deselect them.
 * Deselected modules have their whole folder removed before cleaning. Default keeps
 * everything (parity with previous behavior).
 */
async function promptOptionalModules(targetFolder: string): Promise<void> {
  const modules = await scanOptionalModules(targetFolder);
  if (modules.length === 0) return;

  // Non-interactive (CI, piped stdin, no TTY): can't render a checkbox — keep every module
  // rather than crashing with "User force closed the prompt". Matches the default-keep behavior.
  if (!process.stdin.isTTY) return;

  pauseSpinner();
  // Blank line to separate the preceding progress step from this prompt.
  console.info();
  const keep = await checkbox(
    {
      message: 'Optional modules to include',
      // Leading space on the radio icons adds a gap after the cursor (inquirer renders
      // `${cursor}${checkbox} ${name}` with no space between cursor and checkbox).
      theme: { icon: { checked: ` ${pc.green('◉')}`, unchecked: ' ◯' } },
      choices: modules.map((m) => ({
        name: `${m.name} ${pc.dim(`· ${m.description}`)}`,
        value: m.name,
        checked: true,
      })),
    },
    // Clear the answered prompt so we can print a compact, non-bold summary that lists
    // only the kept module names (not their descriptions).
    { clearPromptOnDone: true },
  );

  // Keep the choice visible after the prompt clears: plain label plus the selected
  // module names only (not their descriptions), or "none" when everything was deselected.
  confirmChoice('Optional modules', keep.length ? keep.join(', ') : pc.dim('none'));
  resumeSpinner();

  // Remove every folder owned by a deselected module. `optionalModuleFolders` lists more
  // route variants than any single module uses; `force: true` ignores the ones absent here.
  const folders = modules.filter((m) => !keep.includes(m.name)).flatMap(optionalModuleFolders);
  await Promise.all(folders.map((f) => rm(join(targetFolder, f), { recursive: true, force: true })));
}
