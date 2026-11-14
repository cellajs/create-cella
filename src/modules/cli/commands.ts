import { basename, resolve } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { NAME, VERSION } from '#/constants';
import { isAppIndex } from '#/utils/detect-used-ports';
import { appSlugRule, isAppSlug } from '#/utils/is-app-slug';
import { isEmail } from '#/utils/is-email';
import type { CLIConfig, CLIOptions } from './types';

function parseAppIndex(value: string): number {
  const parsed = Number(value);

  if (!isAppIndex(parsed)) {
    throw new InvalidArgumentError('App index must be a whole number from 0 to 9, not 4');
  }

  return parsed;
}

function parseAdminEmail(value: string): string {
  if (!isEmail(value)) throw new InvalidArgumentError('Admin email must be an address such as admin@example.com');
  return value;
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
  .option('--admin-email <email>', 'set the admin email for the initial seed user', parseAdminEmail)
  .action((name: string, _options: CLIOptions, self: Command) => {
    const trimmedName = typeof name === 'string' ? name.trim() : name;

    if (trimmedName) {
      if (!isAppSlug(basename(resolve(trimmedName)))) {
        self.error(`error: invalid project name "${trimmedName}": ${appSlugRule}.`);
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
