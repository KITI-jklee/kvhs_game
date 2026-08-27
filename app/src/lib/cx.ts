/** Joins class names, dropping falsy values so conditional classes don't leave stray whitespace. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
