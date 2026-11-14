#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { input, select } from '@inquirer/prompts';
import pc from 'picocolors';
import { TEMPLATE_URL } from '#/constants';
import { create } from '#/create';
import { type CreateOptions, cli, confirmChoice, showWelcome } from '#/modules/cli';
import { findBusyPorts } from '#/utils/busy-ports';
import { detectUsedPorts, findNextAppIndex, isAppIndex } from '#/utils/detect-used-ports';
import { fetchLatestCommit, fetchLatestRelease } from '#/utils/fetch-template-metadata';
import { appSlugRule, isAppSlug } from '#/utils/is-app-slug';
import { isEmail } from '#/utils/is-email';

async function main(): Promise<void> {
  // Display CLI welcome banner
  showWelcome();

  // Shared theme to clear prompts after answering
  const promptTheme = { prefix: '', style: { answer: (text: string) => text } };
  const promptContext = { clearPromptOnDone: true };

  // Choose which template snapshot to scaffold from: a stable release or the
  // latest commit. Skipped when a custom --template is provided (ref doesn't apply).
  const templateRef = cli.options.template ? undefined : await promptTemplateRef(promptTheme, promptContext);

  // Prompt for project name if not provided
  if (!cli.directory) {
    cli.directory = await input(
      {
        message: 'Enter your project name',
        default: 'my-cella-app',
        theme: promptTheme,
        validate: (name) => (isAppSlug(basename(resolve(name))) ? true : `Invalid project name: ${appSlugRule}`),
      },
      promptContext,
    );
  }

  const targetFolder = resolve(cli.directory);
  const projectName = basename(targetFolder);

  if (existsSync(targetFolder) && (await readdir(targetFolder)).length > 0) {
    throw new Error(`${targetFolder} is not empty: choose a new folder, or empty this one first.`);
  }

  // Scan sibling directories and prompt for the app index
  const appIndex = cli.options.appIndex ?? (await promptAppIndex(targetFolder, promptTheme, promptContext));
  confirmChoice('App index', formatAppIndex(appIndex));
  const busyPorts = await findBusyPorts(appIndex);
  if (busyPorts.length > 0) {
    console.info(
      `${pc.yellow('⚠')} In use on this machine: ${busyPorts.join(', ')}. Stop what holds them before pnpm docker and pnpm dev.`,
    );
    console.info();
  }

  // Prompt for admin email. Default uses the reserved `example.com` domain (RFC 2606) so the
  // seed address can never resolve or route real mail — it's a placeholder, not a real inbox.
  const adminEmail =
    cli.options.adminEmail ??
    (await input(
      {
        message: 'Admin email for initial seed user',
        default: 'admin@example.com',
        theme: promptTheme,
        validate: (email) => (isEmail(email) ? true : 'Enter an address such as admin@example.com'),
      },
      promptContext,
    ));
  confirmChoice('Admin email', adminEmail);

  // Proceed with the project creation
  const createOptions: CreateOptions = {
    projectName,
    targetFolder,
    packageManager: cli.packageManager,
    templateUrl: cli.options.template,
    templateRef,
    appIndex,
    adminEmail,
  };

  // create prints its own failure over its spinner
  await create(createOptions).catch(() => process.exit(1));
}

main().catch((error) => {
  // Ctrl-c at a prompt. Its class lives in @inquirer/core, which is no direct dependency: match the name.
  if (error instanceof Error && error.name === 'ExitPromptError') process.exit(130);
  console.error(`${pc.red('✗')} ${pc.red(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
});

/**
 * Show a short intro with the two starting points (latest release and latest
 * commit, each with its date) and let the user choose which template snapshot to
 * scaffold from. Returns the template ref to check out (release tag or `main`), or
 * undefined to use the default branch (when metadata is unavailable).
 */
async function promptTemplateRef(theme: object, context: object): Promise<string | undefined> {
  const [release, commit] = await Promise.all([fetchLatestRelease(), fetchLatestCommit()]);

  // One-sentence intro followed by the data points that are known.
  console.info(pc.dim('This create CLI allows you to get started with cella quickly.'));
  console.info();

  if (release)
    console.info(`  Latest release:  ${release.tag}${release.date ? ` ${pc.dim(`· ${release.date}`)}` : ''}`);
  if (commit) {
    console.info(`  Latest commit:  ${commit.shortSha} ${pc.dim(`· ${commit.message} · ${commit.date}`)}`);
    // Clickable link to the exact commit on GitHub, in grey below the summary line.
    const repo = TEMPLATE_URL.replace('github:', '');
    console.info(`  ${pc.gray(`https://github.com/${repo}/commit/${commit.sha}`)}`);
  }
  if (release || commit) console.info();

  // No release known (offline, or the template's tags did not answer): the app starts from the
  // default branch, and the output says so.
  if (!release) {
    console.info(`${pc.yellow('⚠')} Latest release not found · using the latest commit on main`);
    console.info();
    return commit ? 'main' : undefined;
  }

  // No commit to offer, or no TTY to render the select on (CI, piped stdin): take the latest
  // release, the stable and reproducible starting point.
  if (!commit || !process.stdin.isTTY) {
    confirmChoice('Latest release', release.tag);
    return release.tag;
  }

  const choice = await select(
    {
      message: 'Choose which cella version to start from:',
      theme,
      choices: [
        { name: 'Latest release', value: 'release' },
        { name: 'Latest commit', value: 'commit' },
      ],
    },
    context,
  );

  // The prompt clears itself on done, so keep the choice visible with a checkmark.
  if (choice === 'release') {
    confirmChoice('Latest release', release.tag);
    return release.tag;
  }
  // "Latest commit" is the tip of main; check out the branch (shallow clones can't
  // reliably fetch an arbitrary SHA over GitHub's smart-HTTP protocol).
  confirmChoice('Latest commit', commit.shortSha);
  return 'main';
}

/** Format an app index as a port overview string, e.g. "1 → :3001 / :4010 / :5442" */
function formatAppIndex(i: number, suffix = ''): string {
  return `${i} → :${3000 + i} / :${4000 + i * 10} / :${5432 + i * 10}${suffix}`;
}

/** Scan sibling apps and prompt the user to pick an app index */
async function promptAppIndex(targetFolder: string, theme: object, context: object): Promise<number> {
  const usedPorts = await detectUsedPorts(targetFolder);
  const presets = [1, 2, 3];
  const busy = new Map(await Promise.all([0, ...presets].map(async (i) => [i, await findBusyPorts(i)] as const)));
  const isBusy = (i: number) => (busy.get(i)?.length ?? 0) > 0;
  const suggested = findNextAppIndex(usedPorts, isBusy);
  const label = (i: number, note = '') => formatAppIndex(i, isBusy(i) ? ` (port ${busy.get(i)?.[0]} in use)` : note);

  // Fold a compact hint into the prompt message itself so it's wiped by clearPromptOnDone
  // once an index is chosen — no leftover "Detected forks" trail. Override the default
  // message style (which bolds everything) so only the "App index" title is bold.
  let message = `${pc.bold('App index')} ${pc.dim('· to avoid port conflicts with other apps on this machine')}`;
  if (usedPorts.length > 0) {
    const count = usedPorts.length;
    message += pc.dim(`\nDetected ${count} sibling app${count === 1 ? '' : 's'} · suggested index ${suggested}`);
  }
  const portTheme = {
    ...(theme as Record<string, unknown>),
    style: { ...((theme as { style?: object }).style ?? {}), message: (text: string) => text },
  };

  // Presets exclude 0 (always offered as the explicit default below) and the suggested
  // value (offered first) to avoid duplicate choices.
  const choice = await select(
    {
      message,
      theme: portTheme,
      choices: [
        ...(suggested > 0 ? [{ name: formatAppIndex(suggested, ' (suggested)'), value: suggested }] : []),
        { name: label(0, ' (default)'), value: 0 },
        ...presets.filter((i) => i !== suggested).map((i) => ({ name: label(i), value: i })),
        { name: 'Custom index', value: -1 },
      ],
    },
    context,
  );

  if (choice !== -1) return choice;

  const custom = await input(
    {
      message: 'Enter custom index (0-9, not 4)',
      default: String(suggested),
      theme,
      validate: (val) => (isAppIndex(Number(val)) ? true : 'Must be a whole number from 0 to 9, not 4'),
    },
    context,
  );
  return Number(custom);
}
