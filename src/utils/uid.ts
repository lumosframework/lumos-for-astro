let count = 0;

/**
 * An id unique to the page, for grouping related elements server-side.
 *
 * Counting rather than randomising keeps a build's output the same from one
 * run to the next.
 */
export function uid(prefix: string): string {
  return `${prefix}-${++count}`;
}
