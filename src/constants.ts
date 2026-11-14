import pc from 'picocolors';
import packageJson from '../package.json' with { type: 'json' };

/** Name of this CLI tool */
export const NAME = 'create cella';

/** Thin line divider for console output (60 chars wide) */
export const DIVIDER = '─'.repeat(60);

/** URL of the template repository */
export const TEMPLATE_URL = 'github:cellajs/cella';

/** Canonical owner/repo for template metadata fetched from the GitHub API. */
export const TEMPLATE_REPOSITORY = 'cellajs/cella';

/** HTTPS git URL of the template, for reading its release tags without the GitHub API. */
export const TEMPLATE_GIT_URL = `https://github.com/${TEMPLATE_REPOSITORY}.git`;

/** The app's sync config, which the template ships with its own settings. */
export const SYNC_CONFIG = 'cella/cella.config.ts';

/** Upstream remote of a new app: HTTPS, so reading a public template needs no SSH key. */
export const CELLA_REMOTE_URL = TEMPLATE_GIT_URL;

/**
 * Git remote name pointing at upstream cella. Matches the name the sync CLI
 * (`pnpm cella`) expects, so scaffolds don't end up with a duplicate remote.
 */
export const CELLA_REMOTE_NAME = 'cella-upstream';

/** Export details from package.json */
export const DESCRIPTION: string = packageJson.description;
export const VERSION: string = packageJson.version;
export const WEBSITE: string = packageJson.homepage;

export function getHeaderLine(): string {
  const leftText = `⧈ ${NAME} · ${VERSION}`;
  const left = `${pc.cyan(`⧈ ${NAME}`)} ${pc.dim(`· ${VERSION}`)}`;
  const right = pc.cyan(WEBSITE);
  const padding = Math.max(1, 60 - leftText.length - WEBSITE.length);
  return `${left}${' '.repeat(padding)}${right}`;
}

// Files or folders to be removed from the template after downloading.
// The Pulumi stack file carries cella's own bootstrap markers and encryption
// salt; a fresh app bootstraps its own.
export const TO_REMOVE: string[] = ['./infra/Pulumi.production.yaml'];

// Specific folder contents to be cleaned out from the template
export const TO_CLEAN: string[] = ['./backend/drizzle'];

// Files to copy/paste after downloading
export const TO_COPY: Record<string, string> = {
  './frontend/.env.example': './frontend/.env',
};

/** The template's quickstart, which becomes the new app's README. */
export const QUICKSTART = './cella/QUICKSTART.md';

/** Entry points a coding agent reads from the repo root; the rules and skills live in the template's `cella/` folder. */
export const AGENT_FILES: Record<string, string> = {
  'AGENTS.md':
    '# Agent guidelines\n\nThis app is built from the cella template. Read [cella/AGENTS.md](./cella/AGENTS.md) before changing code: it holds the project rules. Skills, such as `add-entity`, live in [cella/skills](./cella/skills).\n',
  'CLAUDE.md': '@cella/AGENTS.md\n',
};

/** Frontend dev port of an app number. */
export const frontendPort = (appIndex: number): number => 3000 + appIndex;

/**
 * The quickstart as the README of a new app: at the repo root, with this app's port and without the step that just ran.
 * Its links are relative to `cella/` in the template, so `./x` becomes `./cella/x` and `../x` becomes `./x`.
 */
export function quickstartToReadme(source: string, displayName: string, appIndex: number): string {
  return source
    .replace(/^# .*$/m, `# ${displayName}`)
    .replace(/^## Create\n[\s\S]*?(?=^## )/m, '')
    .replaceAll('](./', '](./cella/')
    .replaceAll('](../', '](./')
    .replaceAll('http://localhost:3000', `http://localhost:${frontendPort(appIndex)}`);
}

/**
 * Fork config template that replaces `shared/config/config.default.ts` in new forks.
 */
export const PLACEHOLDER_CONFIG = 'shared/config/config.template.ts';

/**
 * Starting version for a fresh fork. Resets the upstream cella version so
 * release-please cuts the fork's first release from a clean slate.
 */
export const INITIAL_VERSION = '0.0.0';

/**
 * Read a `.env.example` file and apply key=value replacements.
 * Comments and unmatched keys are preserved as-is.
 * Returns null if the file doesn't exist (caller should generate from scratch).
 */
export async function generateEnvFromExample(
  examplePath: string,
  replacements: Record<string, string>,
): Promise<string | null> {
  const { readFile } = await import('node:fs/promises');
  let content: string;
  try {
    content = await readFile(examplePath, 'utf8');
  } catch {
    return null;
  }

  return content.replace(/^([A-Z_][A-Z0-9_]*)=(.*)$/gm, (match, key, _value) => {
    if (key in replacements) return `${key}=${replacements[key]}`;
    return match;
  });
}

/**
 * Replacement map for the app's `.env`: the seed admin alone. The database ports and URLs follow `devAppIndex` in the
 * shared config, and the service ports come from `services` there, so no port lives in the env file.
 */
export function getBackendEnvReplacements(adminEmail: string): Record<string, string> {
  return { ADMIN_EMAIL: adminEmail };
}

/** Set the app's number in the source of `config.default.ts`; a template without the key can only give index 0. */
export function setDevAppIndex(source: string, appIndex: number): string {
  const pattern = /^(\s*devAppIndex:\s*)\d+/m;
  if (appIndex !== 0 && !pattern.test(source)) {
    throw new Error('This template has no devAppIndex in its config: use app index 0, or a newer template.');
  }
  return source.replace(pattern, (_, head: string) => `${head}${appIndex}`);
}
