import { connect } from 'node:net';

const SERVICE_PORTS = 7;

/** Every local port an app number takes: the frontend, its service block, and the dev and test databases. */
const appPorts = (appIndex: number): number[] => [
  3000 + appIndex,
  ...Array.from({ length: SERVICE_PORTS }, (_, i) => 4000 + appIndex * 10 + i),
  5432 + appIndex * 10,
  5434 + appIndex * 10,
];

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

/** The ports of an app number that are already taken, lowest first. */
export async function findBusyPorts(appIndex: number): Promise<number[]> {
  const ports = appPorts(appIndex);
  const listening = await Promise.all(ports.map(isListening));
  return ports.filter((_, i) => listening[i]);
}
