/** A plain shape check: the value lands on one line of the app's `.env` and is the seed user's sign-in address. */
export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
