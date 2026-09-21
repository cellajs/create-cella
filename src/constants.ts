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
 * `config.development.ts`, and a stale `PORT=` env line would silently override
 * the fork's offset (the pre-devPorts collision failure mode).
 */
export function getBackendEnvReplacements(
  slug: string,
  adminEmail: string,
  portOffset: number,
): Record<string, string> {
  const db = 5432 + portOffset;
  return {
    PROJECT_SLUG: slug,
    DB_PORT: String(db),
    DB_TEST_PORT: String(5434 + portOffset),
    DATABASE_URL: `postgres://runtime_role:dev_password@0.0.0.0:${db}/postgres`,
    DATABASE_ADMIN_URL: `postgres://postgres:postgres@0.0.0.0:${db}/postgres`,
    DATABASE_CDC_URL: `postgres://admin_role:dev_password@0.0.0.0:${db}/postgres`,
    ADMIN_EMAIL: adminEmail,
  };
}

/**
 * Generate env config files with project-specific values.
 * All configs go through the same data-driven loop.
 * Values prefixed with '=' are emitted as raw TS expressions (not quoted).
 */
export function generateEnvConfigs(slug: string, name: string, portOffset: number): Record<string, string> {
  const fe = 3000 + portOffset;
  const api = 4000 + portOffset;

  const header =
    "import type { DeepPartial } from '../src/config-builder/types.ts';\nimport type { config as _default } from './config.default.ts';\n";

  // Per-environment specs: optional imports + object props (= prefix → raw TS expression).
  // URL shapes are same-origin (the Vite dev server / public origin proxies /api, /yjs
  // and /mcp), mirroring cella's own config.<mode>.ts files. Service listen ports come
  // from `devPorts`, offset per fork so parallel local stacks never collide on :4000.
  const envs: Record<string, { imports?: string; props: Record<string, string | boolean> }> = {
    development: {
      props: {
        slug: `${slug}-development`,
        domain: '',
        frontendUrl: `http://localhost:${fe}`,
        backendUrl: `http://localhost:${fe}/api`,
        backendAuthUrl: `http://localhost:${fe}/api/auth`,
        yjsUrl: `ws://localhost:${fe}/yjs`,
        mcpUrl: `http://localhost:${fe}/mcp`,
        devPorts: `={ api: ${api}, cdcHealth: ${api + 1}, yjs: ${api + 2}, mcp: ${api + 3} }`,
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
