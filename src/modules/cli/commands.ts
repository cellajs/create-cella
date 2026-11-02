import { basename, resolve } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { NAME, VERSION } from '#/constants';
import { isAppIndex } from '#/utils/detect-used-ports';
import { validateProjectName } from '#/utils/validate-project-name';
import type { CLIConfig, CLIOptions } from './types';

function parseAppIndex(value: string): number {
  const parsed = Number(value);

  if (!isAppIndex(parsed)) {
    throw new InvalidArgumentError('App index must be a whole number from 0 to 9, not 4');
  }

  return parsed;
}

// Initialize CLI variables
let directory: string | null = null;
const packageManager = 'pnpm';

/**
 * Defines the root CLI command using Commander.
 * This command accepts CLI options and validates user input.
 */
export const command = new Command(NAME)
  .version(VERSION, '-v, --version', `output the current version of ${NAME}`)
  .argument('[directory]', 'the directory name for the new project')
  .usage('[directory] [options]')
  .helpOption('-h, --help', 'display this help message')
  .option('--template <path>', 'use a custom template (local path or github:user/repo)')
  .option('--app-index <number>', "set this app's number for its dev ports (0-9, not 4)", parseAppIndex)
  .option('--admin-email <email>', 'set the admin email for the initial seed user')
  .action((name: string) => {
    const trimmedName = typeof name === 'string' ? name.trim() : name;

    if (trimmedName) {
      const validation = validateProjectName(basename(resolve(trimmedName)));

      if (!validation.valid) {
        throw new InvalidArgumentError(`Invalid project name: ${validation.problems?.[0] ?? 'unknown error'}`);
      }

      directory = trimmedName;
    }
  })
  .parse();

// Gather the CLI options and arguments
const options: CLIOptions = command.opts<CLIOptions>();

/**
 * Runs the CLI and returns the parsed configuration.
 * This function parses command line arguments and returns the CLI config.
 */
export function runCli(): CLIConfig {
  return {
    options,
    args: command.args,
    directory,
    packageManager,
  };
}

// Export CLI configuration for direct import
export const cli: CLIConfig = runCli();
