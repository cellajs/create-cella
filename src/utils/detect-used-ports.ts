import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface UsedPorts {
  project: string;
  frontend: number;
  backend: number;
}

/**
 * Scan sibling directories for existing cella apps and extract their dev ports.
 * Looks for `shared/config/config.development.ts` to identify cella-based projects. The frontend port sits in that
 * file's `origin`, or `frontendUrl` in older apps; the backend port in `services.backend.port` of `config.default.ts`,
 * or `devPorts` in either file before that; `devAppIndex` in the default config moves whatever ports the files carry.
 * Handles legacy configs with backendUrl on its own port.
 */
export async function detectUsedPorts(targetFolder: string): Promise<UsedPorts[]> {
  const parentDir = dirname(targetFolder);
  const used: UsedPorts[] = [];

  let siblings: string[];
  try {
    siblings = await readdir(parentDir);
  } catch {
    return used;
  }

  for (const name of siblings) {
    const configDir = join(parentDir, name, 'shared/config');
    try {
      const development = await readFile(join(configDir, 'config.development.ts'), 'utf8');
      const defaults = await readFile(join(configDir, 'config.default.ts'), 'utf8').catch(() => '');
      const feMatch = development.match(/(?:origin|frontendUrl):\s*'http:\/\/localhost:(\d+)/);
      if (!feMatch) continue;
      const frontend = Number(feMatch[1]);
      const index = Number(defaults.match(/devAppIndex:\s*(\d+)/)?.[1] ?? 0);
      // Oldest forks predate devPorts and a backendUrl port; assume the paired port then.
      const servicePattern = /backend:\s*\{[^}]*?\bport:\s*(\d+)/;
      const apiPattern = /devPorts:\s*\{[^}]*?\bapi:\s*(\d+)/;
      const portMatch = defaults.match(servicePattern) ?? development.match(apiPattern) ?? defaults.match(apiPattern);
      const legacyBeMatch = development.match(/backendUrl:\s*'http:\/\/localhost:(\d+)'/);
      const backend = portMatch ? Number(portMatch[1]) : legacyBeMatch ? Number(legacyBeMatch[1]) : frontend + 1000;
      used.push({ project: name, frontend: frontend + index, backend: backend + index * 10 });
    } catch {
      // Not a cella app, skip
    }
  }

  return used;
}

/** Index 4 is never offered: its internal listener would sit on 4045, which fetch refuses. */
export const isAppIndex = (index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index <= 9 && index !== 4;

/** Find the first app index whose frontend port and service block no sibling uses and that `isBusy` leaves free. */
export function findNextAppIndex(usedPorts: UsedPorts[], isBusy: (index: number) => boolean = () => false): number {
  for (let index = 0; index <= 9; index += 1) {
    if (!isAppIndex(index) || isBusy(index)) continue;
    const api = 4000 + index * 10;
    const taken = usedPorts.some((p) => p.frontend === 3000 + index || (p.backend >= api && p.backend < api + 10));
    if (!taken) return index;
  }
  return 0;
}
