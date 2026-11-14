import fs from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { Answers } from './answers';
import { appPorts } from './dev-ports';
import { warn } from './display';

/** The version an app starts from, so release-please cuts its first release from a clean slate. */
const initialVersion = '0.0.0';

/** Entry points a coding agent reads from the repo root; the rules and skills live in the template's `cella/` folder. */
const agentFiles: Record<string, string> = {
  'AGENTS.md':
    '# Agent guidelines\n\nThis app is built from the cella template. Read [cella/AGENTS.md](./cella/AGENTS.md) before changing code: it holds the project rules. Skills, such as `add-entity`, live in [cella/skills](./cella/skills).\n',
  'CLAUDE.md': '@cella/AGENTS.md\n',
};

const manifestPath = 'cella/create-cella.json';
const editNames = [
  'quickstart',
  'configTemplate',
  'config',
  'cliConfig',
  'envExample',
  'releaseConfig',
  'releaseManifest',
] as const;

/** The template paths a new app changes, as the template itself names them in `cella/create-cella.json`. */
interface Manifest {
  remove: string[];
  empty: string[];
  /** Template path to the copy's path in the app. */
  copy: Record<string, string>;
  /** Template path to the symlink's path in the app. */
  link: Record<string, string>;
  edit: Record<(typeof editNames)[number], string>;
}

/** @throws When the template has no manifest, or its manifest names no path for an edit this version makes. */
async function readManifest(targetFolder: string): Promise<Manifest> {
  const source = await fs.readFile(join(targetFolder, manifestPath), 'utf8').catch(() => null);
  if (source === null) throw new Error(`This template has no ${manifestPath}: use a newer template.`);
  const manifest: Manifest = JSON.parse(source);
  const unnamed = editNames.filter((name) => typeof manifest.edit?.[name] !== 'string');
  if (unnamed.length > 0) {
    throw new Error(`${manifestPath} names no path for ${unnamed.join(', ')}: use a newer template.`);
  }
  return manifest;
}

/**
 * Turn the template's files in `targetFolder` into the app's: its name, index and admin email in the config and the
 * `.env`, its own release state, the quickstart as README, and none of the template's own repos, migrations or stack.
 * @returns The template paths it expected and did not find; a template without one skips that edit.
 */
export async function writeAppFiles({ targetFolder, name, appIndex, adminEmail }: Answers): Promise<string[]> {
  const missing: string[] = [];
  const at = (path: string) => join(targetFolder, path);
  // A template path that is not there goes into `missing`, and its edit is skipped
  const edit = async (path: string, change: (file: string) => Promise<unknown>) => {
    try {
      await change(at(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing.push(path);
    }
  };
  const rewrite = (path: string, change: (source: string) => string) =>
    edit(path, async (file) => fs.writeFile(file, change(await fs.readFile(file, 'utf8')), 'utf8'));
  const displayName = name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const { remove, empty, copy, link, edit: paths } = await readManifest(targetFolder);

  try {
    for (const [from, to] of Object.entries(copy)) await edit(from, (file) => fs.copyFile(file, at(to)));
    await edit(paths.quickstart, async (file) =>
      fs.writeFile(at('README.md'), quickstartToReadme(await fs.readFile(file, 'utf8'), displayName, appIndex), 'utf8'),
    );
    await writeAgentEntry(targetFolder, link);

    // The placeholder config becomes the app's default config, and goes
    await edit(paths.configTemplate, async (file) => {
      const source = await fs.readFile(file, 'utf8');
      const config = source
        .replaceAll('__project_name__', displayName)
        .replaceAll('__project_slug__', name)
        .replace(/^(\s*devAppIndex:\s*)\d+/m, (_, head: string) => `${head}${appIndex}`);
      await fs.writeFile(at(paths.config), config, 'utf8');
      await fs.rm(file);
    });

    // The app's own identity: the template's metadata keys stay, emptied, for the app to fill in
    await rewrite('package.json', (source) => {
      let pkg = source
        .replace(/^(\s*"name":\s*)"[^"]*"/m, `$1"${name}"`)
        .replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${initialVersion}"`)
        .replace(/^(\s*"keywords":\s*)\[[^\]]*\]/m, '$1[]');
      for (const field of ['license', 'repository', 'description', 'author', 'homepage']) {
        pkg = pkg.replace(new RegExp(`^(\\s*"${field}":\\s*)"[^"]*"`, 'm'), '$1""');
      }
      return pkg;
    });
    // The template keeps its changelog in its docs folder, which the app keeps as upstream reference
    await rewrite(paths.releaseConfig, (source) => {
      const config = JSON.parse(source) as { packages?: Record<string, Record<string, unknown>> };
      config.packages ??= {};
      config.packages['.'] ??= {};
      config.packages['.']['changelog-path'] = 'CHANGELOG.md';
      return `${JSON.stringify(config, null, 2)}\n`;
    });
    await edit(paths.releaseManifest, (file) => fs.writeFile(file, `{\n  ".": "${initialVersion}"\n}\n`, 'utf8'));
    await fs.writeFile(at('CHANGELOG.md'), '# Changelog\n', 'utf8');

    // `pnpm cella upgrade` never merges this file, so the list goes once here
    await rewrite(paths.cliConfig, stripForks);
    // Every port follows `devAppIndex` in the config, so the admin is the one value the app's `.env` changes
    await edit(paths.envExample, async (file) => {
      const env = (await fs.readFile(file, 'utf8')).replace(/^ADMIN_EMAIL=.*$/gm, () => `ADMIN_EMAIL=${adminEmail}`);
      await fs.writeFile(file.replace(/\.example$/, ''), env, 'utf8');
    });

    // What an app starts without: the template's own migrations, and its stack file with the template's encryption salt
    for (const folder of empty) {
      await edit(folder, async (dir) => {
        const entries = await fs.readdir(dir);
        await Promise.all(entries.map((entry) => fs.rm(join(dir, entry), { recursive: true, force: true })));
      });
    }
    for (const path of remove) await edit(path, (file) => fs.rm(file, { recursive: true }));
  } catch (error) {
    throw new Error(`Error during the cleaning process: ${error instanceof Error ? error.message : error}`);
  }
  return missing;
}

/**
 * The quickstart as the README of a new app: at the repo root, with this app's port and without the step that just ran.
 * Its links are relative to `cella/` in the template, so `./x` becomes `./cella/x` and `../x` becomes `./x`.
 */
function quickstartToReadme(source: string, displayName: string, appIndex: number): string {
  return source
    .replace(/^# .*$/m, `# ${displayName}`)
    .replace(/^## Create\n[\s\S]*?(?=^## )/m, '')
    .replaceAll('](./', '](./cella/')
    .replaceAll('](../', '](./')
    .replaceAll('http://localhost:3000', `http://localhost:${appPorts(appIndex).frontend}`);
}

/** Point coding agents at the template's rules and skills, which sit in `cella/`, out of a root they would not search. */
async function writeAgentEntry(targetFolder: string, link: Manifest['link']): Promise<void> {
  await Promise.all(
    Object.entries(agentFiles).map(([file, content]) => fs.writeFile(join(targetFolder, file), content, 'utf8')),
  );

  // Local to this clone: `.claude` is gitignored, and the check scripts read tracked paths as files. AGENTS.md names the folder for a new clone.
  for (const [target, path] of Object.entries(link)) {
    const file = join(targetFolder, path);
    try {
      await fs.mkdir(dirname(file), { recursive: true });
      await fs.symlink(relative(dirname(file), join(targetFolder, target)), file);
    } catch (error) {
      // Windows refuses a symlink without developer mode; the skills stay readable in their own folder
      warn(`skipped ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** The source of an upgrade config (`cella/cella.config.ts`) without its `forks` property and a comment line directly above it. */
export function stripForks(source: string): string {
  // The closing bracket sits at the property's own indent, or on the same line for a short list
  return source.replace(
    /^(?:[ \t]*\/\/[^\n]*\n)?([ \t]*)forks:\s*\[(?:[^\n]*|[\s\S]*?\n\1)\],?[ \t]*\n(?:[ \t]*\n)?/m,
    '',
  );
}
