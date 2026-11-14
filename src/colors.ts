import { styleText } from 'node:util';

type ColorStyle = 'bold' | 'cyan' | 'dim' | 'gray' | 'green' | 'red' | 'yellow';

function colorsEnabled(): boolean {
  // biome-ignore lint/style/noProcessEnv: the color switches are the only environment this package reads.
  const { NO_COLOR, FORCE_COLOR } = process.env;
  if (NO_COLOR !== undefined) return false;
  if (FORCE_COLOR !== undefined) return FORCE_COLOR !== '0' && FORCE_COLOR !== 'false';
  return !!process.stdout.isTTY;
}

function applyStyle(style: ColorStyle, text: string): string {
  if (!colorsEnabled()) return text;
  return styleText(style, text, { validateStream: false });
}

const pc = {
  bold: (text: string) => applyStyle('bold', text),
  cyan: (text: string) => applyStyle('cyan', text),
  dim: (text: string) => applyStyle('dim', text),
  gray: (text: string) => applyStyle('gray', text),
  green: (text: string) => applyStyle('green', text),
  red: (text: string) => applyStyle('red', text),
  yellow: (text: string) => applyStyle('yellow', text),
};

export default pc;
