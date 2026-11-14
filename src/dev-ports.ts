import { readdir, readFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';

/**
 * The local ports the template's dev stack takes for an app index, as its config shifts them: the index is added to
 * the frontend's and Drizzle Studio's, ten times the index to the seven services' and the dev and test databases'.
 */
export const appPorts = (index: number) => ({
  frontend: 3000 + index,
  drizzleStudio: 3983 + index,
  services: Array.from({ length: 7 }, (_, i) => 4000 + index * 10 + i),
  databases: [5432 + index * 10, 5434 + index * 10],
});

/** Index 4 is never offered: its internal listener would sit on 4045, which fetch refuses. */
export const isAppIndex = (index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index <= 9 && index !== 4;

/** The rule `isAppIndex` checks, worded for a refusal. */
export const appIndexRule = 'a whole number from 0 to 9, not 4';

interface SiblingApp {
  project: string;
  frontend: number;
  backend: number;
}

/**
 * The dev ports of the cella apps beside `targetFolder`, found by their `shared/config/config.development.ts`. The
 * frontend port sits in that file's `origin`, or `frontendUrl` in older apps; the backend port in
 * `services.backend.port` of `config.default.ts`, or `devPorts` in either file before that, or `backendUrl` on a port
 * of its own before that; `devAppIndex` in the default config moves whatever ports the files carry.
 */
export async function detectUsedPorts(targetFolder: string): Promise<SiblingApp[]> {
  const parentDir = dirname(targetFolder);
  const siblings = await readdir(parentDir).catch(() => []);
  const used: SiblingApp[] = [];

  for (const name of siblings) {
    const configDir = join(parentDir, name, 'shared/config');
    const development = await readFile(join(configDir, 'config.development.ts'), 'utf8').catch(() => null);
    const frontendMatch = development?.match(/(?:origin|frontendUrl):\s*'http:\/\/localhost:(\d+)/);
    if (!development || !frontendMatch) continue;
    const defaults = await readFile(join(configDir, 'config.default.ts'), 'utf8').catch(() => '');
    const frontend = Number(frontendMatch[1]);
    const index = Number(defaults.match(/devAppIndex:\s*(\d+)/)?.[1] ?? 0);
    const servicePattern = /backend:\s*\{[^}]*?\bport:\s*(\d+)/;
    const apiPattern = /devPorts:\s*\{[^}]*?\bapi:\s*(\d+)/;
    const portMatch =
      defaults.match(servicePattern) ??
      development.match(apiPattern) ??
      defaults.match(apiPattern) ??
      development.match(/backendUrl:\s*'http:\/\/localhost:(\d+)'/);
    // The oldest apps carry no backend port at all: assume the paired one
    const backend = portMatch ? Number(portMatch[1]) : frontend + 1000;
    used.push({ project: name, frontend: frontend + index, backend: backend + index * 10 });
  }

  return used;
}

/** The first app index whose frontend port and service block no sibling uses and that `isBusy` leaves free, else 0. */
export function findNextAppIndex(siblings: SiblingApp[], isBusy: (index: number) => boolean = () => false): number {
  for (let index = 0; index <= 9; index += 1) {
    if (!isAppIndex(index) || isBusy(index)) continue;
    const { frontend, services } = appPorts(index);
    const api = services[0];
    const taken = siblings.some((p) => p.frontend === frontend || (p.backend >= api && p.backend < api + 10));
    if (!taken) return index;
  }
  return 0;
}

/** Whether something on this machine accepts a connection on the port. */
const isListening = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1', timeout: 300 });
    const finish = (listening: boolean) => {
      socket.destroy();
      resolve(listening);
    };
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });

/** The ports of an app index that are already taken, lowest first. */
export async function findBusyPorts(index: number): Promise<number[]> {
  const ports = Object.values(appPorts(index)).flat();
  const listening = await Promise.all(ports.map(isListening));
  return ports.filter((_, i) => listening[i]);
}
