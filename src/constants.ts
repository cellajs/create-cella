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

/** URL to the repository */
export const CELLA_REMOTE_URL = 'git@github.com:cellajs/cella.git';

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
// The Pulumi stack files carry cella's own bootstrap markers and encryption
// salt; a fresh app bootstraps its own. Removing them also keeps the deploy
// workflow's staging gate false until the app bootstraps, so a fresh scaffold
// never auto-deploys staging on its first push to main.
export const TO_REMOVE: string[] = ['./infra/Pulumi.production.yaml', './infra/Pulumi.staging.yaml'];

// Specific folder contents to be cleaned out from the template
export const TO_CLEAN: string[] = ['./backend/drizzle'];

// Files to copy/paste after downloading
export const TO_COPY: Record<string, string> = {
  './frontend/.env.example': './frontend/.env',
  './cella/QUICKSTART.md': 'README.md',
};

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
 * Replacement map for `backend/.env`.
 * The backend `.env` is the single source of truth for the project slug, database
 * ports (consumed by `backend/compose.yaml`), connection URLs and admin email.
 * Service ports deliberately do NOT live here: they come from `devPorts` in
 * shared config, and a stale `PORT=` env line would silently override the app's
 * `devAppIndex` (the pre-devPorts collision failure mode).
 */
export function getBackendEnvReplacements(slug: string, adminEmail: string, appIndex: number): Record<string, string> {
  const db = 5432 + appIndex * 10;
  return {
    PROJECT_SLUG: slug,
    DB_PORT: String(db),
    DB_TEST_PORT: String(5434 + appIndex * 10),
    DATABASE_URL: `postgres://runtime_role:dev_password@0.0.0.0:${db}/postgres`,
    DATABASE_ADMIN_URL: `postgres://postgres:postgres@0.0.0.0:${db}/postgres`,
    DATABASE_CDC_URL: `postgres://admin_role:dev_password@0.0.0.0:${db}/postgres`,
    ADMIN_EMAIL: adminEmail,
  };
}

/** Set the app's number in the source of `config.default.ts`; a template without the key can only give index 0. */
export function setDevAppIndex(source: string, appIndex: number): string {
  const pattern = /^(\s*devAppIndex:\s*)\d+/m;
  if (appIndex !== 0 && !pattern.test(source)) {
    throw new Error('This template has no devAppIndex in its config: use app index 0, or a newer template.');
  }
  return source.replace(pattern, (_, head: string) => `${head}${appIndex}`);
}

/**
 * Generate env config files with project-specific values.
 * All configs go through the same data-driven loop.
 * Values prefixed with '=' are emitted as raw TS expressions (not quoted).
 */
export function generateEnvConfigs(slug: string, name: string): Record<string, string> {
  const header =
    "import type { DeepPartial } from '../src/config-builder/types.ts';\nimport type { config as _default } from './config.default.ts';\n";

  // Per-environment specs: optional imports + object props (= prefix → raw TS expression).
  // URL shapes are same-origin (the Vite dev server / public origin proxies /api, /yjs,
  // /mcp and /oauth), mirroring cella's own config.<mode>.ts files. The URLs carry app number 0's
  // port: `devAppIndex` in config.default.ts moves them and `devPorts` when the config builds.
  const envs: Record<string, { imports?: string; props: Record<string, string | boolean> }> = {
    development: {
      props: {
        slug: `${slug}-development`,
        domain: '',
        frontendUrl: 'http://localhost:3000',
        backendUrl: 'http://localhost:3000/api',
        backendAuthUrl: 'http://localhost:3000/api/auth',
        yjsUrl: 'ws://localhost:3000/yjs',
        mcpUrl: 'http://localhost:3000/mcp',
        oauthUrl: 'http://localhost:3000/oauth',
        // The template's shared development buckets hold the seed files and the GeoIP databases,
        // so seeded attachments render before the app has storage of its own.
        s3: "={ region: 'nl-ams', host: 's3.nl-ams.scw.cloud', publicBucket: 'cella-shared-public', privateBucket: 'cella-shared-private' }",
      },
    },
    staging: {
      props: {
        slug: `${slug}-staging`,
        domain: `${slug}.example.com`,
        frontendUrl: `https://staging.${slug}.example.com`,
        backendUrl: `https://staging.${slug}.example.com/api`,
        backendAuthUrl: `https://staging.${slug}.example.com/api/auth`,
        yjsUrl: `wss://staging.${slug}.example.com/yjs`,
        mcpUrl: `https://staging.${slug}.example.com/mcp`,
        oauthUrl: `https://staging.${slug}.example.com/oauth`,
      },
    },
    tunnel: {
      props: {
        slug: `${slug}-tunnel`,
        frontendUrl: `https://${slug}.ngrok.dev`,
        backendUrl: `https://${slug}.ngrok.dev/api`,
        backendAuthUrl: `https://${slug}.ngrok.dev/api/auth`,
        yjsUrl: `wss://${slug}.ngrok.dev/yjs`,
        mcpUrl: `https://${slug}.ngrok.dev/mcp`,
        oauthUrl: `https://${slug}.ngrok.dev/oauth`,
      },
    },
    test: {
      imports: "import { development } from './config.development.ts';\n",
      props: {
        domain: '',
        frontendUrl: '=development.frontendUrl',
        backendUrl: '=development.backendUrl',
        backendAuthUrl: '=development.backendAuthUrl',
        yjsUrl: '=development.yjsUrl',
        mcpUrl: '=development.mcpUrl',
        oauthUrl: '=development.oauthUrl',
      },
    },
    production: { props: { maintenance: false } },
  };

  // Serialize value: '=' prefix → raw TS expression, boolean → literal, string → quoted
  const lit = (v: string | boolean) => {
    if (typeof v === 'boolean') return String(v);
    if (v.startsWith('=')) return v.slice(1);
    return `'${v}'`;
  };

  const result: Record<string, string> = {};

  for (const [mode, { imports = '', props }] of Object.entries(envs)) {
    const nameEntry = mode !== 'production' ? `  name: '${name} ${mode.toUpperCase()}',\n` : '';
    const body = Object.entries(props)
      .map(([k, v]) => `  ${k}: ${lit(v)},`)
      .join('\n');
    result[`./shared/config/config.${mode}.ts`] =
      `${header}${imports}\nexport const ${mode} = {\n  mode: '${mode}',\n${nameEntry}${body}\n} satisfies DeepPartial<typeof _default>;\n`;
  }

  return result;
}
