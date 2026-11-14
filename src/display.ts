import { relative } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };
import type { Answers } from './answers';
import pc from './colors';
import { appPorts } from './dev-ports';

export const cliName = 'create cella';
export const cliVersion = packageJson.version;

const divider = '─'.repeat(60);
const checkMark = pc.green('✓');

export function showBanner(): void {
  console.info();
  console.info(pc.cyan('                      _ _            '));
  console.info(pc.cyan('▒▓█████▓▒     ___ ___| | | __ _      '));
  console.info(pc.cyan('▒▓█   █▓▒    / __/ _ \\ | |/ _` |    '));
  console.info(pc.cyan('▒▓█   █▓▒   | (_|  __/ | | (_| |     '));
  console.info(pc.cyan('▒▓█████▓▒    \\___\\___|_|_|\\__,_|  '));
  console.info();
  console.info(pc.dim(packageJson.description));
  console.info();
  const left = `⧈ ${cliName}`;
  const right = packageJson.homepage;
  // Padding counts the visible characters only, not the ANSI codes
  const padding = Math.max(1, divider.length - `${left} · ${cliVersion}${right}`.length);
  console.info(`${pc.cyan(left)} ${pc.dim(`· ${cliVersion}`)}${' '.repeat(padding)}${pc.cyan(right)}`);
  console.info(divider);
}

/** Keep the answer of a prompt that clears itself on screen. */
export function confirmChoice(label: string, value: string): void {
  console.info(`${checkMark} ${label} · ${value}`);
  console.info();
}

let stepText: string | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

/** Animate the running step on a terminal only: a log gets the finished steps. Stdin stays untouched, so ctrl-c reaches the run. */
function spin(): void {
  if (!stepText || !process.stdout.isTTY) return;
  const frames = ['-', '\\', '|', '/'];
  let frame = 0;
  const render = () => process.stdout.write(`\r${pc.cyan(frames[frame++ % frames.length])} ${stepText}`);
  render();
  timer = setInterval(render, 80);
}

function clearSpinner(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
  process.stdout.write('\r\x1b[2K');
}

/** Mark the running step done and start `text`; without text the steps end. */
export function step(text?: string): void {
  clearSpinner();
  if (stepText) console.info(`${checkMark} ${stepText}`);
  stepText = text;
  spin();
}

/** End the steps without marking the running one done. */
export function stopSpinner(): void {
  clearSpinner();
  stepText = undefined;
}

/** Print a warning above the running step. */
export function warn(message: string): void {
  clearSpinner();
  console.warn(`${pc.yellow('⚠')} ${message}`);
  spin();
}

export function showNextSteps({ name, targetFolder, appIndex, adminEmail }: Answers): void {
  const path = relative(process.cwd(), targetFolder);
  const and = pc.dim('&&');

  console.info();
  console.info(`${checkMark} ${pc.bold(`created ${name}`)}`);
  console.info();
  console.info(pc.bold('Next steps'));
  console.info(divider);
  console.info();
  if (path) console.info(`${pc.dim('$')} cd ${pc.cyan(path)}`);
  console.info(`${pc.dim('$')} ${pc.cyan('pnpm install')}`);
  console.info(`${pc.dim('$')} ${pc.cyan('pnpm generate')}`);
  console.info(`${pc.dim('$')} ${pc.cyan('pnpm docker')} ${and} ${pc.cyan('pnpm seed')} ${and} ${pc.cyan('pnpm dev')}`);
  console.info();
  console.info(
    `${pc.gray('Then open')} ${pc.cyan(`http://localhost:${appPorts(appIndex).frontend}`)} ${pc.gray('and sign in as')} ${pc.cyan(adminEmail)}${pc.gray(': the magic link is printed in the pnpm dev output.')}`,
  );
  console.info();
  // Relative to the new app, so the terminal links the app's README, not this package's
  console.info(
    `${pc.gray('To get started building, please read:')} ${pc.cyan(path ? `${path}/README.md` : 'README.md')}`,
  );
  console.info();
  console.info(`🥳 enjoy building ${pc.green(name)} with cella!`);
  console.info();
}
