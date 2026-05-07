/**
 * Tiny class-name joiner. Accepts the same argument shapes as `clsx` for the
 * cases we actually use: strings, conditional `false`, undefined, nested
 * arrays. Avoids pulling in the dep just for joining a few class strings.
 */
export function cn(...args: Array<string | false | null | undefined | string[]>): string {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (Array.isArray(a)) {
      for (const s of a) if (s) out.push(s);
    } else {
      out.push(a);
    }
  }
  return out.join(" ");
}
