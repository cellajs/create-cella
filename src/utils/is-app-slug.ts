/** The template's config refuses any other `slug` at its first load (cella `shared/src/config-builder/app-config.ts`). */
export const isAppSlug = (name: string): boolean =>
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) && name.replaceAll('-', '').length >= 4;

/** The rule `isAppSlug` checks, worded for a refusal. */
export const appSlugRule =
  'the name becomes the app slug: lowercase letters and digits, starting with a letter, single hyphens between parts and at least 4 characters besides hyphens, such as my-app';
