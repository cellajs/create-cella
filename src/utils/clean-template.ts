import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import {
  generateEnvConfigs,
  generateEnvFromExample,
  getBackendEnvReplacements,
  INITIAL_VERSION,
  PLACEHOLDER_CONFIG,
  TO_CLEAN,
  TO_COPY,
  TO_REMOVE,
} from '#/constants';

const warningMark = pc.yellow('⚠');

/**
 * Cleans the specified template by removing designated folders and files.
 * @param params - Parameters containing the target folder, project name, and optional extra edits.
 */
export async function cleanTemplate({
  targetFolder,
  projectName,
  displayName,
  portOffset = 0,
  adminEmail = `admin@${projectName}.example.com`,
}: {
  targetFolder: string;
  projectName: string;
  displayName: string;
  portOffset?: number;
  adminEmail?: string;
}): Promise<void> {
  // Change the current working directory to targetFolder if not already set
  if (process.cwd() !== targetFolder) {
    process.chdir(targetFolder);
  }

  return new Promise<void>((resolve, reject) => {
    (async () => {
      try {
        // Copy specified files
        for (const [src, dest] of Object.entries(TO_COPY)) {
          const srcAbsolutePath = path.resolve(targetFolder, src);
          const destAbsolutePath = path.resolve(targetFolder, dest);
          await copyFile(srcAbsolutePath, destAbsolutePath);
        }

        // Replace config.default.ts with interpolated placeholder config
        await applyPlaceholderConfig(targetFolder, projectName, displayName);

        // Reset release/versioning state so the fork starts under its own identity
        await resetReleaseState(targetFolder, projectName);

        // Generate backend .env from backend/.env.example.
        // The backend .env is the single source of truth for the project slug and DB ports
        // (consumed by backend/compose.yaml). There is no root .env.
        const backendReplacements = getBackendEnvReplacements(projectName, adminEmail, portOffset);
        const backendEnv = await generateEnvFromExample(
          path.resolve(targetFolder, 'backend/.env.example'),
          backendReplacements,
        );
        if (backendEnv) {
          await fs.writeFile(path.resolve(targetFolder, 'backend/.env'), backendEnv, 'utf8');
        }

        // Generate minimal env config files with project values and ports baked in
        const envConfigs = generateEnvConfigs(projectName, displayName, portOffset);
        await Promise.all(
          Object.entries(envConfigs).map(([filePath, content]) =>
            fs.writeFile(path.resolve(targetFolder, filePath), content, 'utf8'),
          ),
        );

        // Clean specified folder contents
        await Promise.all(
          TO_CLEAN.map((folderPath) => {
            const absolutePath = path.resolve(targetFolder, folderPath);
            return removeFolderContents(absolutePath);
          }),
        );

        // Remove specified files and folders
        await Promise.all(
          TO_REMOVE.map((filePath) => {
            const absolutePath = path.resolve(targetFolder, filePath);
            return removeFileOrFolder(absolutePath);
          }),
        );

        resolve();
      } catch (err) {
        reject(`Error during the cleaning process: ${err}`);
      }
    })();
  });
}

/**
 * Removes all contents within a specified folder.
 * @param folderPath - The path of the folder to clean.
 */
async function removeFolderContents(folderPath: string): Promise<void> {
  // List all files in the folder. Skip silently if the folder doesn't exist —
  // the template may not include every optional folder (e.g. backend/drizzle).
  let files: string[];
  try {
    files = await fs.readdir(folderPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }

  // `recursive: true` handles nested folders; `force: true` ignores races/missing entries.
  await Promise.all(files.map((file) => fs.rm(path.join(folderPath, file), { recursive: true, force: true })));
}

/**
 * Removes a specified file or folder.
 * @param pathToRemove - The path to the file or folder to remove.
 */
async function removeFileOrFolder(pathToRemove: string): Promise<void> {
  await fs.rm(pathToRemove, { recursive: true, force: true });
}

/**
 * Helper function to copy files if the source exists.
 * @param src - The source file path.
 * @param dest - The destination file path.
 */
async function copyFile(src: string, dest: string): Promise<void> {
  try {
    // Check if the source file exists
    await fs.access(src);

    // Ensure the destination directory exists
    await fs.mkdir(path.dirname(dest), { recursive: true });

    // Copy the file
    await fs.copyFile(src, dest);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.info(`\n${warningMark} Source file "${src}" does not exist > Skip copy`);
    } else {
      throw err;
    }
  }
}

/**
 * Read the fork config template shipped inside the cloned Cella template
 * (`shared/config/config.template.ts`), interpolate project tokens, write the
 * result as `shared/config/config.default.ts` — replacing the original — and
 * delete the now-consumed template from the fork.
 */
async function applyPlaceholderConfig(targetFolder: string, projectName: string, displayName: string): Promise<void> {
  const src = path.resolve(targetFolder, PLACEHOLDER_CONFIG);
  const dest = path.resolve(targetFolder, './shared/config/config.default.ts');

  try {
    let content = await fs.readFile(src, 'utf8');
    content = content.replaceAll('__project_name__', displayName);
    content = content.replaceAll('__project_slug__', projectName);
    await fs.writeFile(dest, content, 'utf8');
    await fs.rm(src, { force: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.info(`\n${warningMark} Fork config template "${src}" not found > Skip`);
    } else {
      throw err;
    }
  }
}

/**
 * Reset the upstream cella release identity so the new fork starts clean:
 * - root `package.json`: `name` → project slug, `version` → INITIAL_VERSION,
 *   and blank out `license`/`repository`/`description`/`keywords`/`author`/`homepage`
 *   (keys kept visible so the fork can fill in its own metadata)
 * - `.github/release-please-manifest.json` → `{ ".": INITIAL_VERSION }`
 * - `.github/release-please-config.json`: `changelog-path` → root `CHANGELOG.md`
 *   (cella tracks its own changelog in the template docs folder, which the fork
 *   keeps as upstream reference; the fork's own releases write to a fresh root changelog)
 * - `CHANGELOG.md` → fresh stub
 */
async function resetReleaseState(targetFolder: string, projectName: string): Promise<void> {
  // Root package.json: rewrite only the top-level fields in place to avoid reformatting
  // the whole file. Set name/version to the fork's identity, then blank out the upstream
  // cella metadata (license, repository, description, keywords, author, homepage) while
  // keeping the keys visible so the fork can fill them in.
  const pkgPath = path.resolve(targetFolder, 'package.json');
  try {
    let pkg = await fs.readFile(pkgPath, 'utf8');
    pkg = pkg.replace(/^(\s*"name":\s*)"[^"]*"/m, `$1"${projectName}"`);
    pkg = pkg.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${INITIAL_VERSION}"`);
    // Empty each string field, keeping the key so the fork sees the shape.
    for (const field of ['license', 'repository', 'description', 'author', 'homepage']) {
      pkg = pkg.replace(new RegExp(`^(\\s*"${field}":\\s*)"[^"]*"`, 'm'), '$1""');
    }
    // Collapse the multi-line keywords array to an empty one.
    pkg = pkg.replace(/^(\s*"keywords":\s*)\[[^\]]*\]/m, '$1[]');
    await fs.writeFile(pkgPath, pkg, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.info(`\n${warningMark} "package.json" not found > Skip version reset`);
    } else {
      throw err;
    }
  }

  // Point release-please at a root CHANGELOG.md for the fork. The upstream Cella
  // changelog stays wherever the template keeps it; the fork's own releases live at root.
  const configPath = path.resolve(targetFolder, '.github/release-please-config.json');
  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      packages?: Record<string, Record<string, unknown>>;
    };
    config.packages ??= {};
    config.packages['.'] ??= {};
    config.packages['.']['changelog-path'] = 'CHANGELOG.md';
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.info(`\n${warningMark} "release-please-config.json" not found > Skip changelog path reset`);
    } else {
      throw err;
    }
  }

  // Reset the release-please manifest and changelog. `force: true` writes even if absent.
  await fs.writeFile(
    path.resolve(targetFolder, '.github/release-please-manifest.json'),
    `{\n  ".": "${INITIAL_VERSION}"\n}\n`,
    'utf8',
  );
  await fs.writeFile(path.resolve(targetFolder, 'CHANGELOG.md'), '# Changelog\n', 'utf8');
}
