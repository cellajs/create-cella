import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { input, select } from '@inquirer/prompts';
import pc from './colors';
import { appIndexRule, appPorts, detectUsedPorts, findBusyPorts, findNextAppIndex, isAppIndex } from './dev-ports';
import { confirmChoice, warn } from './display';
import { fetchLatestCommit, fetchLatestRelease, templateRepository } from './template';

/** The template's config refuses any other `slug` at its first load (cella `shared/src/config-builder/app-config.ts`). */
export const isAppSlug = (name: string): boolean =>
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) && name.replaceAll('-', '').length >= 4;

/** The rule `isAppSlug` checks, worded for a refusal. */
export const appSlugRule =
  'the name becomes the app slug: lowercase letters and digits, starting with a letter, single hyphens between parts and at least 4 characters besides hyphens, such as my-app';

/** A plain shape check: the value lands on one line of the app's `.env` and is the seed user's sign-in address. */
export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** What the command line answered already. */
export interface Flags {
  directory?: string;
  /** A local git checkout or `github:owner/repo`. */
  template?: string;
  appIndex?: number;
  adminEmail?: string;
}

export interface Answers {
  template?: string;
  /** The release tag or branch to clone; the default branch when absent, and unused for a local template. */
  templateRef?: string;
  targetFolder: string;
  /** The app's slug: the name of its folder. */
  name: string;
  appIndex: number;
  adminEmail: string;
}

// A prompt clears itself once answered, and `confirmChoice` keeps the answer on screen
const theme = { prefix: '', style: { answer: (text: string) => text } };
const context = { clearPromptOnDone: true };

/** Ask what the flags leave open, and refuse a folder that is not empty. */
export async function askAnswers({ directory, template, ...flags }: Flags): Promise<Answers> {
  // A custom template is taken as it is
  const templateRef = template ? undefined : await askTemplateRef();

  const targetFolder = resolve(
    directory ??
      (await input(
        {
          message: 'Enter your app name',
          default: 'my-cella-app',
          theme,
          validate: (name) => (isAppSlug(basename(resolve(name))) ? true : `Invalid app name: ${appSlugRule}`),
        },
        context,
      )),
  );
  if (existsSync(targetFolder) && (await readdir(targetFolder)).length > 0) {
    throw new Error(`${targetFolder} is not empty: choose a new folder, or empty this one first.`);
  }

  const appIndex = flags.appIndex ?? (await askAppIndex(targetFolder));
  confirmChoice('App index', formatAppIndex(appIndex));
  const busyPorts = await findBusyPorts(appIndex);
  if (busyPorts.length > 0) {
    warn(`In use on this machine: ${busyPorts.join(', ')}. Stop what holds them before pnpm docker and pnpm dev.`);
    console.info();
  }

  // The reserved example.com domain (RFC 2606) can never route real mail
  const adminEmail =
    flags.adminEmail ??
    (await input(
      {
        message: 'Admin email for initial seed user',
        default: 'admin@example.com',
        theme,
        validate: (email) => (isEmail(email) ? true : 'Enter an address such as admin@example.com'),
      },
      context,
    ));
  confirmChoice('Admin email', adminEmail);

  return { template, templateRef, targetFolder, name: basename(targetFolder), appIndex, adminEmail };
}

/**
 * Offer the latest release and the latest commit, each with its date, as the template to start from.
 * @returns The release tag, or `main` for the latest commit; undefined when neither is known (offline).
 */
async function askTemplateRef(): Promise<string | undefined> {
  const [release, commit] = await Promise.all([fetchLatestRelease(), fetchLatestCommit()]);

  console.info(pc.dim('This create CLI allows you to get started with cella quickly.'));
  console.info();
  if (release)
    console.info(`  Latest release:  ${release.tag}${release.date ? ` ${pc.dim(`· ${release.date}`)}` : ''}`);
  if (commit) {
    console.info(`  Latest commit:  ${commit.sha.slice(0, 7)} ${pc.dim(`· ${commit.message} · ${commit.date}`)}`);
    console.info(`  ${pc.gray(`https://github.com/${templateRepository}/commit/${commit.sha}`)}`);
  }
  if (release || commit) console.info();

  if (!release) {
    warn('Latest release not found · using the latest commit on main');
    console.info();
    return commit ? 'main' : undefined;
  }

  // Without a commit to offer or a terminal to choose on (CI, piped stdin), the release is the reproducible start
  const choices = [
    { name: 'Latest release', value: 'release' },
    { name: 'Latest commit', value: 'commit' },
  ];
  if (
    !commit ||
    !process.stdin.isTTY ||
    (await select({ message: 'Choose which cella version to start from:', theme, choices }, context)) === 'release'
  ) {
    confirmChoice('Latest release', release.tag);
    return release.tag;
  }
  // The tip of main: a shallow clone over GitHub's smart HTTP cannot reliably fetch an arbitrary sha
  confirmChoice('Latest commit', commit.sha.slice(0, 7));
  return 'main';
}

/** An app index with its frontend, backend and database ports, such as "1 → :3001 / :4010 / :5442". */
function formatAppIndex(index: number, note = ''): string {
  const { frontend, services, databases } = appPorts(index);
  return `${index} → :${frontend} / :${services[0]} / :${databases[0]}${note}`;
}

/** Suggest an app index no sibling app and no listener on this machine takes, and ask for one. */
async function askAppIndex(targetFolder: string): Promise<number> {
  const siblings = await detectUsedPorts(targetFolder);
  const presets = [1, 2, 3];
  const busy = new Map(await Promise.all([0, ...presets].map(async (i) => [i, await findBusyPorts(i)] as const)));
  const isBusy = (i: number) => (busy.get(i)?.length ?? 0) > 0;
  const suggested = findNextAppIndex(siblings, isBusy);
  const label = (i: number, note = '') => formatAppIndex(i, isBusy(i) ? ` (port ${busy.get(i)?.[0]} in use)` : note);

  // The hint sits in the message, so clearPromptOnDone wipes it; a plain message style keeps the title alone bold
  let message = `${pc.bold('App index')} ${pc.dim('· to avoid port conflicts with other apps on this machine')}`;
  if (siblings.length > 0) {
    const count = siblings.length;
    message += pc.dim(`\nDetected ${count} sibling app${count === 1 ? '' : 's'} · suggested index ${suggested}`);
  }

  // 0 is the default and the suggestion comes first, so neither repeats among the presets
  const choice = await select(
    {
      message,
      theme: { ...theme, style: { ...theme.style, message: (text: string) => text } },
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
      message: `Enter custom index, ${appIndexRule}`,
      default: String(suggested),
      theme,
      validate: (value) => (isAppIndex(Number(value)) ? true : `Must be ${appIndexRule}`),
    },
    context,
  );
  return Number(custom);
}
