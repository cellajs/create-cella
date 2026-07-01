import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import {
  generateEnvConfigs,
  generateEnvFromExample,
  getBackendEnvReplacements,
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
