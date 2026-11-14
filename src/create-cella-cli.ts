#!/usr/bin/env tsx

import { mkdir, readdir, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { appSlugRule, askAnswers, type Flags, isAppSlug, isEmail } from './answers';
import { writeAppFiles } from './app-files';
import { makeRepository } from './app-repo';
import pc from './colors';
import { appIndexRule, isAppIndex } from './dev-ports';
import { cliName, cliVersion, showBanner, showNextSteps, step, stopSpinner, warn } from './display';
import { getTemplate } from './template';

function parseFlags(): Flags {
  const program = new Command(cliName)
    .version(cliVersion, '-v, --version', `output the current version of ${cliName}`)
    .argument('[directory]', 'the directory name for the new app')
    .usage('[directory] [options]')
    .helpOption('-h, --help', 'display this help message')
    .option('--template <path>', 'use a custom template (local git checkout or github:user/repo)')
    .option('--app-index <number>', `set this app's number for its dev ports, ${appIndexRule}`, (value) => {
      if (!isAppIndex(Number(value))) throw new InvalidArgumentError(`App index must be ${appIndexRule}`);
      return Number(value);
    })
    .option('--admin-email <email>', 'set the admin email for the initial seed user', (value) => {
      if (!isEmail(value)) throw new InvalidArgumentError('Admin email must be an address such as admin@example.com');
      return value;
    })
    .parse();

  const directory = program.args[0]?.trim() || undefined;
  if (directory && !isAppSlug(basename(resolve(directory)))) {
    program.error(`error: invalid app name "${directory}": ${appSlugRule}.`);
  }
  return { directory, ...program.opts<Omit<Flags, 'directory'>>() };
}

async function main(): Promise<void> {
  const flags = parseFlags();
  showBanner();
  const answers = await askAnswers(flags);
  const { targetFolder } = answers;

  // Until the app is made, a failure or a signal removes what the run wrote
  let undo = async () => {};
  const onSignal = (code: number) => () => {
    stopSpinner();
    void undo().finally(() => process.exit(code));
  };
  const onSigint = onSignal(130);
  const onSigterm = onSignal(143);
  process.once('SIGINT', onSigint).once('SIGTERM', onSigterm);

  let missing: string[];
  try {
    step('creating app folder');
    const createdFolder = await mkdir(targetFolder, { recursive: true });
    undo = () => removeOutput(targetFolder, createdFolder);
    const baseCommit = await getTemplate(answers);
    step('cleaning template');
    missing = await writeAppFiles(answers);
    step('initializing git');
    await makeRepository(targetFolder, baseCommit);
    step();
  } catch (error) {
    stopSpinner();
    await undo();
    throw error;
  } finally {
    process.off('SIGINT', onSigint).off('SIGTERM', onSigterm);
  }

  if (missing.length > 0) warn(`Not in the template, skipped: ${missing.join(', ')}`);
  showNextSteps(answers);
}

/** Remove what a run wrote: the folders `mkdir` made, else everything in the target, which the run only accepts empty. */
async function removeOutput(targetFolder: string, createdFolder: string | undefined): Promise<void> {
  if (createdFolder) return rm(createdFolder, { recursive: true, force: true });
  const entries = await readdir(targetFolder);
  await Promise.all(entries.map((entry) => rm(join(targetFolder, entry), { recursive: true, force: true })));
}

main().catch((error) => {
  // Ctrl-c at a prompt. Its class lives in @inquirer/core, which is no direct dependency: match the name.
  if (error instanceof Error && error.name === 'ExitPromptError') process.exit(130);
  console.error(`${pc.red('✗')} ${pc.red(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
});
